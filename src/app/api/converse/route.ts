import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { callGeminiWithRetry } from '@/lib/gemini'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, "1 h"),
}) : null

export async function POST(req: Request) {
  try {
    const { formId, currentFieldIndex, history, userMessage, extraContext } = await req.json()

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`converse_${ip}_${formId}`)
      if (!success) {
        return NextResponse.json({ error: "You're going too fast — please wait a moment before continuing." }, { status: 429 })
      }
    }

    // 1. Fetch Form details
    const { data: form } = await supabaseAdmin.from('forms').select('user_id, title').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    // 2. Fetch admin's Gemini + Groq Keys (bypassing RLS)
    const { data: keys } = await supabaseAdmin.from('user_keys').select('gemini_key, groq_key').eq('user_id', form.user_id).single()
    if (!keys?.gemini_key) {
      return NextResponse.json({ error: 'Form owner has not configured API keys' }, { status: 400 })
    }

    // 3. Fetch Fields
    const { data: fields } = await supabaseAdmin.from('fields').select('*').eq('form_id', formId).order('order_index')
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: 'Form fields not found' }, { status: 404 })
    }

    const currentField = fields[currentFieldIndex]
    const isLastField = currentFieldIndex === fields.length - 1

    // 4. Build system instruction + user prompt
    const emailInstruction = currentField.field_type === 'email'
      ? `\nCRITICAL EMAIL FORMATTING: The user is providing an email address via voice.
1. Strip ALL spaces from the extracted value.
2. Convert to lowercase.
3. Autocorrect common Whisper transcription artifacts: "dot con" → ".com", "dot net" → ".net", "dot co" → ".co", "at gmail" → "@gmail.com", "at yahoo" → "@yahoo.com", "at hotmail" → "@hotmail.com".
4. Handle phonetic spelling (e.g. "P U N E E T at gmail dot com" → "puneet@gmail.com").
5. If the result is NOT a structurally valid email matching pattern x@y.z, set "extractedValue": null and ask the user to slowly spell it out again.`
      : ''

    const systemInstruction = `You collect form data conversationally for "${form.title}".
CRITICAL: Users may speak in Hinglish (Hindi+English code-switching) or casual slang (e.g. "mera naam Puneet hai", "CS branch", "teen saal se"). Extract data entities accurately regardless of grammar or language. Preserve proper nouns (names, places, brand names) EXACTLY as transcribed by Whisper — do not translate or alter them.
Extract the user's answer for the current field and ask for the next. Be warm and natural. No filler words like "Great!" or "Noted!". If they give an invalid answer for the field type (e.g., text for a number field), gently push back. Decline off-topic prompts by steering back to the form.
CRITICAL VOICE FORMATTING: Your aiMessage will be read aloud by a Text-to-Speech engine. Write EXACTLY as a human speaks — never use markdown, asterisks, bullet points, or numbered lists. Use commas and em-dashes to create natural speech pauses. Keep your ENTIRE response to 2 short sentences maximum. Ask only ONE question per turn.${emailInstruction}
Respond ONLY with JSON: {"extractedValue": "string or null", "aiMessage": "string"}`

    const recentHistory = history.slice(-4)
    const ctx = recentHistory.map((m: any) => `${m.role === 'ai' ? 'A' : 'U'}: ${m.text}`).join('\n')
    const nextFieldHint = isLastField ? '[LAST FIELD]' : `→ next: "${fields[currentFieldIndex + 1]?.label}"`
    const userPrompt = `${extraContext ? extraContext + '\n' : ''}Field: "${currentField.label}" (${currentField.field_type}) ${nextFieldHint}\n${ctx}\nU: ${userMessage}`

    // 5. Call Gemini with backoff + Groq fallback
    const responseText = await callGeminiWithRetry(
      keys.gemini_key,
      keys.groq_key ?? null,
      'gemini-2.5-flash',
      systemInstruction,
      userPrompt,
    )

    const parsed = JSON.parse(responseText)

    // If we're on the last field, the conversation is done regardless of extraction result
    const isComplete = isLastField
    const nextIndex = parsed.extractedValue ? Math.min(currentFieldIndex + 1, fields.length) : currentFieldIndex

    return NextResponse.json({
      aiMessage: parsed.aiMessage,
      extractedValue: parsed.extractedValue,
      nextFieldIndex: nextIndex,
      isComplete
    })
  } catch (error: any) {
    console.error('Converse API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

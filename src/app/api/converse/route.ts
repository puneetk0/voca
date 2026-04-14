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
    const { formId, currentFieldIndex, history, userMessage } = await req.json()

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
    const systemInstruction = `You collect form data conversationally for "${form.title}". Extract the user's answer for the current field and ask for the next. Be brief and natural. No filler words like "Great!" or "Noted!". Decline off-topic questions.
Respond ONLY with JSON: {"extractedValue": "string or null", "aiMessage": "string"}`

    const recentHistory = history.slice(-4)
    const ctx = recentHistory.map((m: any) => `${m.role === 'ai' ? 'A' : 'U'}: ${m.text}`).join('\n')
    const nextFieldHint = isLastField ? '[LAST FIELD]' : `→ next: "${fields[currentFieldIndex + 1]?.label}"`
    const userPrompt = `Field: "${currentField.label}" (${currentField.field_type}) ${nextFieldHint}\n${ctx}\nU: ${userMessage}`

    // 5. Call Gemini with backoff + Groq fallback
    const responseText = await callGeminiWithRetry(
      keys.gemini_key,
      keys.groq_key ?? null,
      'gemini-2.5-flash',
      systemInstruction,
      userPrompt,
    )

    const parsed = JSON.parse(responseText)

    const isComplete = Boolean(parsed.extractedValue && isLastField)
    const nextIndex = parsed.extractedValue ? currentFieldIndex + 1 : currentFieldIndex

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

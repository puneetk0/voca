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

// The old prompt told Gemini to use "Got it, Perfect, Alright" — so it rotated
// through exactly those three words every single turn. This replacement gives
// Gemini a personality and a range of natural reactions, and critically tells
// it WHY the rules exist (TTS readback) so it reasons about them better.
function buildSystemPrompt(formTitle: string, fieldType: string, userEmail?: string): string {
  const emailRules = fieldType === 'email' ? `
CURRENT FIELD IS AN EMAIL ADDRESS.
- Strip all spaces, lowercase the entire address.
- Fix phonetic dictation: "dot com" → ".com", "at gmail" → "@gmail", "underscore" → "_".
- If the result doesn't match x@y.z exactly, set extractedValue to null and say something like "Hmm, that one didn't quite come through — could you spell out your email slowly?"
- Never accept a response that's just a name or a sentence describing an email.
${userEmail ? `- Their registered email is ${userEmail}. Ask first: "Should I just use ${userEmail}?" and if they confirm, use it.` : ''}` : ''

  return `You are helping someone fill out a form called "${formTitle}". You are friendly, warm, and relaxed — like a helpful friend, not a customer service bot.

YOUR JOB: Extract what the user just said, then ask the next question naturally.

PERSONALITY RULES:
- React to what they said before asking the next thing. If they said something interesting, briefly acknowledge it in a natural way. If they hesitated or corrected themselves, be reassuring.
- NEVER start two consecutive responses with the same word or phrase.
- Vary your acknowledgements. Do NOT use "Got it", "Perfect", "Alright", or "Sure" more than once per conversation. Instead, react naturally to the actual content: "Oh nice", "That works", "Cool cool", "Makes sense", "Noted", "Yep", "Okay great" — or even just skip the filler entirely and ask the next question directly if the flow allows.
- If someone gives an obviously wrong answer type, laugh it off gently: "Ha, I think we need your phone number there, not your email — mind sharing that instead?"

FORMAT RULES (CRITICAL — your text will be read aloud by a voice engine):
- Write exactly as a human speaks. Contractions only: "that's", "what's", "you're", not "that is", "what is", "you are".
- Zero markdown. No asterisks, no lists, no headers, no hyphens as bullets.
- Maximum 1 question per response. Maximum 2 sentences total.
- Never end with more than one question mark.
- Numbers should be written as words when part of a sentence: "one more thing" not "1 more thing".
${emailRules}

OUTPUT FORMAT: Respond ONLY with valid JSON, nothing else:
{"extractedValue": "the extracted answer as a clean string, or null if invalid", "aiMessage": "your spoken response"}`
}

export async function POST(req: Request) {
  try {
    const { formId, currentFieldIndex, history, userMessage, extraContext, userEmail } = await req.json()

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`converse_${ip}_${formId}`)
      if (!success) {
        return NextResponse.json({ error: "You're going too fast — please wait a moment before continuing." }, { status: 429 })
      }
    }

    const { data: form } = await supabaseAdmin.from('forms').select('user_id, title').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    const { data: keys } = await supabaseAdmin.from('user_keys').select('gemini_key, groq_key').eq('user_id', form.user_id).single()
    if (!keys?.gemini_key) {
      return NextResponse.json({ error: 'Form owner has not configured API keys' }, { status: 400 })
    }

    const { data: fields } = await supabaseAdmin.from('fields').select('*').eq('form_id', formId).order('order_index')
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: 'Form fields not found' }, { status: 404 })
    }

    const currentField = fields[currentFieldIndex]
    const isLastField = currentFieldIndex === fields.length - 1
    const nextField = !isLastField ? fields[currentFieldIndex + 1] : null

    const systemInstruction = buildSystemPrompt(form.title, currentField.field_type, userEmail)

    // Keep last 6 turns (3 exchanges) — enough context without bloating the prompt.
    // The old code used 4 which could cut off mid-exchange.
    const recentHistory = history.slice(-6)
    const ctx = recentHistory.map((m: any) => `${m.role === 'ai' ? 'Assistant' : 'User'}: ${m.text}`).join('\n')

    // Tell Gemini what field comes NEXT so it can ask about it naturally,
    // not just "Got it. What's your [field label]?"
    const nextFieldContext = nextField
      ? `After extracting the current answer, your next question should naturally lead into: "${nextField.label}" (type: ${nextField.field_type}).`
      : `This is the LAST question. After extracting the answer, say something brief and warm like "That's everything — thanks so much!" or "All done, thanks!" Keep it to one short sentence.`

    const userPrompt = `${extraContext ? extraContext + '\n' : ''}Current field to extract: "${currentField.label}" (type: ${currentField.field_type})
${nextFieldContext}

Conversation so far:
${ctx}
User: ${userMessage}`

    const responseText = await callGeminiWithRetry(
      keys.gemini_key,
      keys.groq_key ?? null,
      'gemini-2.5-flash',
      systemInstruction,
      userPrompt,
    )

    // Safer JSON parsing — Gemini sometimes wraps in ```json blocks despite instructions
    let parsed: { extractedValue: string | null; aiMessage: string }
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Last resort: if Gemini returns plain text, treat the whole thing as the message
      parsed = { extractedValue: null, aiMessage: responseText.slice(0, 200) }
    }

    const isComplete = isLastField
    const nextIndex = parsed.extractedValue !== null
      ? Math.min(currentFieldIndex + 1, fields.length)
      : currentFieldIndex

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
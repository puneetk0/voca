import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { callGeminiWithRetry } from '@/lib/gemini'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis ? new Ratelimit({
  redis,
  // Rate limit keyed on IP only — NOT formId, which is user-supplied and
  // could be spoofed to get a fresh window per request.
  limiter: Ratelimit.slidingWindow(50, "1 h"),
}) : null

// Per-field-type validation rules injected into the system prompt.
// Keeping these separate makes it easy to add new field types later
// without touching the core personality/format rules.
function getFieldRules(fieldType: string, userEmail?: string): string {
  switch (fieldType) {
    case 'email':
      return `
FIELD TYPE: Email address
- Strip all spaces, force lowercase on the entire address.
- Fix phonetic dictation: "dot com" → ".com", "at the rate gmail" → "@gmail", "underscore" → "_", "dash" → "-".
- Common Indian English patterns: "gmail dot com" → "gmail.com", "yahoo dot in" → "yahoo.in"
- Only accept if result matches x@y.z format exactly. If invalid, set extractedValue to null.
- When asking to repeat, be specific: "Could you spell that out slowly? Like, j-o-h-n at gmail dot com?"
${userEmail ? `- Their registered account email is ${userEmail}. You can ask: "Want me to use ${userEmail}?" and confirm before accepting.` : ''}`

    case 'number':
      return `
FIELD TYPE: Number
- Extract only the numeric value. Strip currency symbols, units, etc. unless the field label implies they're needed.
- Handle spoken numbers: "twenty five" → "25", "two point five" → "2.5"
- If clearly not a number, set extractedValue to null and ask gently.`

    case 'phone':
      return `
FIELD TYPE: Phone number
- Accept 10-digit Indian numbers, or international format with country code.
- Fix phonetic: "double eight" → "88", "oh" → "0"
- Format consistently: strip spaces and dashes, keep + prefix if present.
- If ambiguous, ask: "Just to confirm — is that a 10-digit number starting with...?"`

    case 'textarea':
      return `
FIELD TYPE: Long text / paragraph
- Accept the full response as-is. Don't truncate or summarize.
- If the response seems very short for a textarea field, you can gently ask: "Want to add anything else, or is that good?"`

    default:
      return `FIELD TYPE: Short text — accept the response as-is after cleaning up obvious transcription noise.`
  }
}

// The system prompt is the core of what makes Voca feel like a conversation
// rather than a form. Key design decisions:
//
// 1. "You already know them" framing — Gemini is told it has *context* about the
//    person, which nudges it to reference earlier answers naturally ("Cool, so
//    you're based in Mumbai — what's the best number to reach you there?")
//
// 2. Explicit ban on interrogation patterns — the old prompt's 2-sentence limit
//    was correct for TTS, but without explaining WHY, Gemini would robotically
//    fire "Got it. What's X?" every turn. Now it knows the goal is flow, not speed.
//
// 3. Reaction examples are concrete — instead of abstract "be friendly", we give
//    Gemini actual examples of reactions calibrated to Indian conversational style.
//
// 4. TTS format rules explained by purpose — Gemini reasons better when it knows
//    WHY: "no markdown because it's read aloud" is more robust than just "no markdown".
function buildSystemPrompt(
  formTitle: string,
  fieldType: string,
  allFields: Array<{ label: string; field_type: string }>,
  currentFieldLabel: string,
  userEmail?: string,
): string {
  const fieldRules = getFieldRules(fieldType, userEmail)
  const fieldList = allFields.map((f, i) => `${i + 1}. ${f.label} (${f.field_type})`).join('\n')

  return `You are having a friendly, flowing conversation to help someone fill out a form called "${formTitle}".

You're not a bot reading out form fields. You're more like a helpful friend who happens to be collecting some info. You already have context from the whole conversation — use it to make transitions feel natural, not mechanical.

FORM OVERVIEW (all fields, for your context):
${fieldList}

YOUR CURRENT TASK: Extract the answer for "${currentFieldLabel}"

CONVERSATION STYLE:
- Speak like a real person, not a customer service script. Indian English / Hinglish is totally fine — "yaar", "na", "basically", "actually" are all natural here.
- React genuinely to what they said before asking the next thing. If it's interesting, say so briefly. If they corrected themselves, reassure them.
- Use their previous answers to make transitions feel connected. Example: if they said they're from Delhi and the next field is phone, say "Nice, Delhi! And what's the best number to reach you on?"
- Vary your reactions every single turn. NEVER use the same opening word twice in a row. Good reactions: "Oh nice", "That works", "Makes sense", "Cool cool", "Got that", "Yep", "Okay", "Noted" — or skip the filler entirely and just flow into the question.
- NEVER start two consecutive responses with the same word.
- If someone hesitates, self-corrects, or rambles — be warm: "No worries, take your time" or just accept what makes sense and move on.
- If the answer type is obviously wrong (name given instead of phone), be light about it: "Ha, think I need your number there, not your name — what's a good one to reach you on?"

FORMAT RULES (your responses are read aloud by a voice engine — this is critical):
- Write exactly as someone speaks. Contractions always: "that's", "what's", "you're" — never "that is", "what is".
- Zero markdown. No asterisks, no lists, no headers, no bullet points, no hyphens as bullets. Ever.
- Maximum ONE question per response. Maximum TWO sentences total.
- Never end with more than one question mark.
- Spell out numbers in conversational context: "one more thing" not "1 more thing".
- No em dashes (—) — use a comma or period instead.

${fieldRules}

RESPONSE FORMAT: Valid JSON only, nothing else, no markdown fences:
{"extractedValue": "clean extracted answer as string, or null if invalid/unclear", "aiMessage": "your spoken response"}`
}

export async function POST(req: Request) {
  try {
    const {
      formId,
      currentFieldIndex,
      history,
      userMessage,
      extraContext,
      userEmail,
    } = await req.json()

    if (ratelimit) {
      // Key on IP only — not formId (user-supplied, spoofable)
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`converse_${ip}`)
      if (!success) {
        return NextResponse.json(
          { error: "You're going a bit fast — please wait a moment before continuing." },
          { status: 429 },
        )
      }
    }

    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('user_id, title')
      .eq('id', formId)
      .single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    const { data: keys } = await supabaseAdmin
      .from('user_keys')
      .select('gemini_key, groq_key')
      .eq('user_id', form.user_id)
      .single()
    if (!keys?.gemini_key) {
      return NextResponse.json(
        { error: 'Form owner has not configured API keys' },
        { status: 400 },
      )
    }

    const { data: fields } = await supabaseAdmin
      .from('fields')
      .select('*')
      .eq('form_id', formId)
      .order('order_index')
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: 'Form fields not found' }, { status: 404 })
    }

    const currentField = fields[currentFieldIndex]
    const isLastField = currentFieldIndex === fields.length - 1
    const nextField = !isLastField ? fields[currentFieldIndex + 1] : null

    const systemInstruction = buildSystemPrompt(
      form.title,
      currentField.field_type,
      fields.map(f => ({ label: f.label, field_type: f.field_type })),
      currentField.label,
      userEmail,
    )

    // Keep last 10 turns (5 exchanges) — bumped from 6 to give Gemini more
    // context to reference earlier answers naturally in transitions.
    const recentHistory = history.slice(-10)
    const ctx = recentHistory
      .map((m: any) => `${m.role === 'ai' ? 'Assistant' : 'User'}: ${m.text.replace('[Voice] ', '')}`)
      .join('\n')

    // Tell Gemini what's coming next so it can craft a natural transition,
    // not just "Got it. What's your [label]?"
    const nextFieldContext = nextField
      ? `After extracting the current answer, transition naturally into asking about: "${nextField.label}" (${nextField.field_type}). Reference their previous answer if it makes the transition feel connected.`
      : `This is the LAST field. After extracting the answer, close warmly and briefly — one sentence, like "That's everything, thanks so much!" or "All done, appreciate it!" Keep it genuine, not scripted.`

    const userPrompt = [
      extraContext ?? '',
      `Current field: "${currentField.label}" (${currentField.field_type})`,
      nextFieldContext,
      '',
      'Conversation so far:',
      ctx,
      `User: ${userMessage}`,
    ].filter(Boolean).join('\n')

    const responseText = await callGeminiWithRetry(
      keys.gemini_key,
      keys.groq_key ?? null,
      'gemini-2.5-flash',
      systemInstruction,
      userPrompt,
    )

    let parsed: { extractedValue: string | null; aiMessage: string }
    try {
      // Strip markdown code fences Gemini sometimes adds despite instructions
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Last resort: treat entire response as the message, don't extract a value
      parsed = { extractedValue: null, aiMessage: responseText.slice(0, 200) }
    }

    const nextIndex = parsed.extractedValue !== null
      ? Math.min(currentFieldIndex + 1, fields.length)
      : currentFieldIndex

    return NextResponse.json({
      aiMessage: parsed.aiMessage,
      extractedValue: parsed.extractedValue,
      nextFieldIndex: nextIndex,
      isComplete: isLastField && parsed.extractedValue !== null,
    })

  } catch (error: any) {
    console.error('Converse API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
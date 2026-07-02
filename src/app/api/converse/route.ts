import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { callFastFirst } from '@/lib/llm'
import { checkLimit } from '@/lib/ratelimit'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// The interactive latency budget (~8-12s worst case) needs more than the
// default serverless duration on some plans.
export const maxDuration = 30

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis ? new Ratelimit({
  redis,
  // Rate limit keyed on IP only — NOT formId, which is user-supplied and
  // could be spoofed to get a fresh window per request.
  limiter: Ratelimit.slidingWindow(500, "1 h"),
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
${userEmail ? `- EMAIL AUTO-FILL: The user's registered email "${userEmail}" is already recorded. DO NOT ask for their email. Automatically set extractedValues = {this_field_id: "${userEmail}"} and advance nextFieldIndex past this field. In spokenMessage, confirm it briefly as part of the transition: "Got your email on file — " then immediately ask the next question. Never ask the user to confirm or re-enter it.` : ''}`

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

    case 'file':
      return `
FIELD TYPE: File Upload (Document, Resume, Image, etc.)
- DO NOT ask them to spell out or describe the file verbally.
- Explicitly instruct them to tap the upload zone on their screen.
- If they just uploaded a file (you'll see a [System: User uploaded file: URL] message), set the extractedValue to that URL.`

    case 'mcq': {
      // Runtime MCQ options are injected in buildSystemPrompt.
      // Return a safe fallback in case options weren't passed (should never happen).
      return `FIELD TYPE: Multiple Choice
- Respond with one of the options shown to the user. Do not accept free-form answers.`
    }

    default:
      return `FIELD TYPE: Short text — accept the response as-is after cleaning up obvious transcription noise.`
  }
}

// Per-form personality presets. The creator picks one; it swaps the "voice"
// of the interviewer without touching the extraction/format machinery.
export type AiTone = 'professional' | 'friendly' | 'playful'

const TONE_PRESETS: Record<AiTone, string> = {
  professional: `- Courteous, concise, competent — a sharp executive assistant. No slang, no exclamation marks, no jokes.
- Acknowledge answers briefly and precisely ("Noted." / "Understood.") before moving on.`,
  friendly: `- Warm, genuine, conversational — a friendly colleague, never a customer service agent.
- NEVER start with filler words like: "Perfect", "Got it", "Okay", "Hmm", "Right", "Great", "Awesome". Jump straight in.`,
  playful: `- Light, witty, energetic — a fun host keeping things moving. A dash of humor is welcome, but keep every reply short.
- Vary your energy: tease gently, celebrate good answers, never repeat the same joke pattern twice.`,
}

type Persona = {
  aiContext: string | null
  aiTone: AiTone
  welcomeMessage: string | null
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
  allFields: Array<{ id: string; label: string; field_type: string; options?: string[]; logic_rules?: any[] }>,
  currentFieldLabel: string,
  userEmail?: string,
  currentFieldOptions?: string[],
  currentLanguage: 'hi' | 'en' = 'en',
  persona: Persona = { aiContext: null, aiTone: 'friendly', welcomeMessage: null },
): string {
  let fieldRules = getFieldRules(fieldType, userEmail)

  // Inject real MCQ options at runtime
  if (fieldType === 'mcq' && currentFieldOptions && currentFieldOptions.length > 0) {
    const optionsList = currentFieldOptions.map(o => `"${o}"`).join(', ')
    fieldRules = `
FIELD TYPE: Multiple Choice
- VALID OPTIONS: [${optionsList}]
- CRITICAL: You MUST verify the user's response against the VALID OPTIONS list. 
- If the user provides an answer that is NOT in the list (e.g., they say "four" when the options are "Yes" and "No"), you MUST:
  1. Set "extractedValues" to {} (empty object).
  2. In "spokenMessage", gently inform them that you didn't catch a valid choice and repeat the options.
- If they provide a valid choice (or a very close synonym like "yep" for "Yes"), set the value to the EXACT option string from the list.
- Never extract a value for an MCQ field that is not one of the predefined options.`
  }

  const fieldList = allFields.map((f, i) => {
    let ruleText = ''
    if (f.logic_rules && f.logic_rules.length > 0) {
      ruleText = ` [Branching Rules: ${JSON.stringify(f.logic_rules)}]`
    }
    return `${i}. [ID: ${f.id}] ${f.label} (${f.field_type})${ruleText}`
  }).join('\n')

  // Use the first real field ID as the example in the prompt so Gemini doesn't copy a fake placeholder
  const exampleId = allFields[0]?.id ?? 'FIELD_UUID'

  const isHindi = currentLanguage === 'hi'

  const contextBlock = persona.aiContext?.trim()
    ? `
CREATOR CONTEXT (background from the form creator — this is what you KNOW; use it to answer the respondent's questions and make transitions specific, never invent beyond it):
${persona.aiContext.trim()}
`
    : ''

  return `You are having a warm, flowing conversation to help someone fill out a form called "${formTitle}".

You are not a bot reading fields. You are an empathetic, active listener who genuinely cares about what the person is saying — not just extracting data. You already have context from the whole conversation; use it to make every transition feel human, not mechanical.

FORM OVERVIEW (all fields, for your context):
${fieldList}
${contextBlock}
YOUR CURRENT TASK: Extract the answer for "${currentFieldLabel}"

LANGUAGE: ${isHindi ? 'Hindi' : 'English'}
${isHindi ? `- Respond in natural, conversational Hindi (Devanagari script) in spokenMessage. Simple, everyday Hindi — like a helpful friend, not a formal document.
- SWITCH DETECTION: If the user explicitly asks to switch to English ("English mein baat karo", "switch to English", "please speak English" or any clear English switch request), set "language" to "en" in your JSON response and respond in English from this turn.` : `- Respond in warm Indian English.
- SWITCH DETECTION: If the user explicitly asks for Hindi ("Hindi mein baat karo", "speak Hindi", "हिंदी में बोलो" or any clear Hindi switch request), set "language" to "hi" in your JSON response and respond in Hindi (Devanagari) from this turn.`}
- extractedValues MUST always be in English/Latin script, never Hindi script. Transliterate: "पुनीत" → "Puneet".
- displayedMessage MUST always be in English regardless of language.

OPENING HOOK (ONLY on the very first turn — when conversation history is empty):
${persona.welcomeMessage?.trim()
  ? `Open with this exact welcome from the form creator (translate it naturally to ${isHindi ? 'Hindi' : 'English'} if it isn't already): "${persona.welcomeMessage.trim()}". Then immediately ask the first field question.`
  : `Open with exactly 2 sentences:
1. A warm, contextual greeting that references what this form is about ("${formTitle}"). Sound like a friend, not a customer service agent.
2. Immediately ask the first field question.`}
Keep it natural. No word limits. Do NOT mention how long it will take. Do NOT ask about language.
extractedValues must be {} and nextFieldIndex must be 0.

CORRECTION HANDLING (applies throughout the entire conversation):
If the user's message contains a correction to a PREVIOUS answer — signals like "actually", "wait", "no that's wrong", "I meant", "not X but Y", "that was wrong", "change my [field]", "my [field] should be" — do this:
1. Identify which previously answered field they're correcting using the conversation history
2. Extract the corrected value for that field
3. Include it in extractedValues with the correct field ID (alongside any current-field answer if also given)
4. Keep nextFieldIndex at the CURRENT field unless the current field is also answered in this turn
5. In spokenMessage, briefly confirm: "Got it, [corrected value]" and then re-ask the current question if it still needs an answer
The user can correct any past answer at any time. Never argue. Never second-guess their correction.

EMOTIONAL SIGNAL DETECTION (critical — read between the lines):
Analyze the TONE of the user's response, not just the content. Then respond accordingly (in the current language):
- HESITANT (self-deprecating, unsure): Validate WARMLY and specifically before moving on.
- FRUSTRATED (short/clipped, repeated corrections): Acknowledge and take the blame. Re-ask simply.
- EXCITED (enthusiastic): Mirror their energy.
- POSITIVE/NEUTRAL: Respond naturally.

CONVERSATION STYLE (tone: ${persona.aiTone}):
${TONE_PRESETS[persona.aiTone]}
- ${isHindi ? 'Use natural Hindi transitional words sparingly: "अच्छा", "बढ़िया", "ठीक है" — each only once per conversation.' : 'FILLER WORD ROTATION (strict): One acknowledgment per turn, each used only once: ["Love that", "Noted", "Makes sense", "That works", "Good to know", "Appreciated", "Solid"].'}
- REACT TO CONTENT, not just receipt: pick up a specific detail from what they actually SAID and mirror it in 3-6 words before the next question ("Mumbai, nice — big move?"). Never a generic "thanks for sharing".
- If someone hesitates or rambles, be warm and accepting.
- PROGRESS: once past the halfway point of the form, briefly acknowledge momentum ONCE ("more than halfway, this is quick") — never mention it again after that.

FORMAT RULES (responses are read aloud — non-negotiable):
- Zero markdown. No asterisks, lists, headers, bullets. Ever.
- Maximum ONE question per response. Maximum TWO sentences total.
- Never end with more than one question mark.
- No em dashes or en dashes. Use a comma or period instead.

${fieldRules}

RESPONSE FORMAT: Valid JSON only, nothing else, no markdown fences:
{
  "extractedValues": { "${exampleId}": "the extracted value" },
  "nextFieldIndex": 1,
  "sentiment": "positive | neutral | hesitant | frustrated",
  "language": "${isHindi ? 'hi' : 'en'}",
  "spokenMessage": "${isHindi ? 'your response in Hindi (Devanagari) — warm, human, read aloud' : 'your response in English — warm, human, read aloud'}",
  "displayedMessage": "ONLY the core question shown on screen. Always in English.",
  "personalizationHints": { "name": "extracted name if known, else null", "keyDataPoint": "most meaningful non-name answer so far, else null" }
}

IMPORTANT FOR JSON SCHEMA:
- "extractedValues": Map the EXACT field ID to extracted value. Copy IDs exactly. If nothing extracted, return {}.
- "nextFieldIndex": 0-indexed integer of the NEXT field. Usually current + 1.
- "sentiment": One of the four options, based on tone analysis.
- "language": "${isHindi ? 'hi' : 'en'}" normally. Set to "en" ONLY when user explicitly requests English switch.
- "personalizationHints": Always populate if you have the data.
`
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
      confidence,
      currentLanguage,
    } = await req.json()

    if (ratelimit) {
      // Key on IP only — not formId (user-supplied, spoofable)
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const allowed = await checkLimit(ratelimit, `converse_${ip}`)
      if (!allowed) {
        return NextResponse.json(
          { error: "You're going a bit fast. Please wait a moment before continuing.", code: 'rate_limited' },
          { status: 429 },
        )
      }
    }

    // Perf: fetch form + fields in parallel — only keys fetch depends on form.user_id
    const [formResult, fieldsResult] = await Promise.all([
      // select('*') keeps this resilient if migration 0002 hasn't run yet —
      // missing personality columns simply come back undefined.
      supabaseAdmin.from('forms').select('*').eq('id', formId).single(),
      supabaseAdmin.from('fields').select('*').eq('form_id', formId).order('order_index'),
    ])

    const form = formResult.data
    if (!form) return NextResponse.json({ error: 'Form not found', code: 'not_found' }, { status: 404 })
    if (!form.is_active) {
      // Owner bypass: allow the creator to preview a paused form.
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== form.user_id) {
        return NextResponse.json({ error: 'This form is closed.', code: 'form_closed' }, { status: 403 })
      }
    }

    const { data: keys } = await supabaseAdmin
      .from('user_keys')
      .select('groq_key')
      .eq('user_id', form.user_id)
      .single()

    // Fall back to platform env var keys when user hasn't configured their own
    const effectiveGroqKey = keys?.groq_key || process.env.GROQ_KEY || null
    const effectiveCerebrasKey = process.env.CEREBRAS_API_KEY || null

    const fields = fieldsResult.data
    if (!fields || fields.length === 0) {
      return NextResponse.json({ error: 'This form has no questions configured.', code: 'no_fields' }, { status: 422 })
    }

    const currentField = fields[currentFieldIndex]
    const isLastField = currentFieldIndex === fields.length - 1

    // Client sends the session language explicitly; the form's configured
    // default is the safety net (English unless the creator chose Hindi).
    const lang: 'hi' | 'en' = currentLanguage === 'hi' || currentLanguage === 'en'
      ? currentLanguage
      : (form.default_language === 'hi' ? 'hi' : 'en')

    const tone: AiTone = form.ai_tone === 'professional' || form.ai_tone === 'playful' ? form.ai_tone : 'friendly'

    const systemInstruction = buildSystemPrompt(
      form.title,
      currentField.field_type,
      fields.map(f => ({ id: f.id, label: f.label, field_type: f.field_type, options: f.options, logic_rules: f.logic_rules })),
      currentField.label,
      userEmail,
      currentField.options ?? undefined,
      lang,
      { aiContext: form.ai_context ?? null, aiTone: tone, welcomeMessage: form.welcome_message ?? null },
    )

    // Keep last 10 turns (5 exchanges) — bumped from 6 to give Gemini more
    // context to reference earlier answers naturally in transitions.
    const recentHistory = history.slice(-10)
    const ctx = recentHistory
      .map((m: any) => `${m.role === 'ai' ? 'Assistant' : 'User'}: ${m.text.replace('[Voice] ', '')}`)
      .join('\n')

    // Tell Gemini what's coming next so it can craft a natural transition
    const nextField = !isLastField ? fields[currentFieldIndex + 1] : null
    const nextFieldContext = nextField
      ? `After extracting the current answer, transition naturally into asking about: "${nextField.label}" (${nextField.field_type}). Reference their previous answer if it makes the transition feel connected.`
      : `This is the LAST field. After extracting the answer, give a warm, specific sign-off in ONE sentence only.
- If you know the user's name from the conversation history, USE it: "Thanks Puneet, we're all set!"
- Reference something specific they told you — their city, their course, their farm size, their company. Make it feel like you actually listened, not a generic farewell.
- No more questions. No "Hope to see you there!" unless the form context genuinely warrants it. Just a warm, real, specific human goodbye.`

    const userPrompt = [
      extraContext ?? '',
      `Current field: "${currentField.label}" (${currentField.field_type})`,
      `Progress: question ${currentFieldIndex + 1} of ${fields.length}.`,
      nextFieldContext,
      '',
      'Conversation so far:',
      ctx,
      `User: ${userMessage}`,
    ].filter(Boolean).join('\n')

    const groqKeys = [
      effectiveGroqKey,
      process.env.GROQ_KEY_2,
      process.env.GROQ_KEY_3,
    ].filter(Boolean) as string[]

    if (groqKeys.length === 0 && !effectiveCerebrasKey && !process.env.GEMINI_KEY) {
      return NextResponse.json({ error: 'No AI keys configured for this form.', code: 'no_keys' }, { status: 400 })
    }

    // Tight interactive budget: worst case ~8-12s, safely under the client's 15s.
    let responseText: string
    try {
      responseText = await callFastFirst(
        groqKeys,
        effectiveCerebrasKey,
        systemInstruction,
        userPrompt,
        { perCallTimeoutMs: 4000, maxGroqKeys: 2, geminiRetries: 0 },
      )
    } catch (llmErr: any) {
      console.error('[Converse] All LLM providers failed:', llmErr?.message)
      return NextResponse.json(
        { error: 'The AI is unavailable right now. Please try again.', code: 'upstream_down' },
        { status: 502 },
      )
    }

    let parsed: { extractedValues?: Record<string, string>; extractedValue?: string | null; nextFieldIndex?: number; sentiment?: string; language?: string; spokenMessage: string; displayedMessage: string }
    try {
      const cleaned = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      parsed = JSON.parse(cleaned)

      if (!parsed.spokenMessage && (parsed as any).aiMessage) {
        parsed.spokenMessage = (parsed as any).aiMessage
        parsed.displayedMessage = (parsed as any).aiMessage
      }
    } catch {
      parsed = {
        spokenMessage: responseText.slice(0, 200),
        displayedMessage: responseText.slice(0, 200)
      }
    }

    // Support legacy scalar extraction or new multi-intent map
    let sanitizedExtractedValues: Record<string, string> = {}
    const validFieldIds = new Set(fields.map(f => f.id))

    if (parsed.extractedValues) {
      Object.entries(parsed.extractedValues).forEach(([id, val]) => {
        if (validFieldIds.has(id)) {
          sanitizedExtractedValues[id] = val as string
        } else {
          console.warn(`[Converse] AI hallucinated field ID: ${id}. Stripping.`)
        }
      })
    } else if (parsed.extractedValue) {
      sanitizedExtractedValues[currentField.id] = parsed.extractedValue
    }

    const nextIndex = parsed.nextFieldIndex !== undefined 
      ? parsed.nextFieldIndex 
      : (Object.keys(sanitizedExtractedValues).length > 0 ? Math.min(currentFieldIndex + 1, fields.length) : currentFieldIndex);
      
    // Epic 7: Confidence-based sentiment correction to prevent false positives
    let finalSentiment = parsed.sentiment || 'neutral'
    if (confidence !== undefined && confidence < 0.70) {
      finalSentiment = 'neutral'
    }

    const hasExtracted = Object.keys(sanitizedExtractedValues).length > 0;

    // Language: default to current, switch to 'en' only when AI explicitly signals it
    const responseLanguage: 'hi' | 'en' = parsed.language === 'en' ? 'en' : lang

    return NextResponse.json({
      aiSpokenMessage: parsed.spokenMessage,
      aiMessage: parsed.displayedMessage,
      extractedValues: sanitizedExtractedValues,
      nextFieldIndex: nextIndex,
      sentiment: finalSentiment,
      language: responseLanguage,
      isComplete: isLastField && (hasExtracted || nextIndex >= fields.length),
    })

  } catch (error: any) {
    console.error('Converse API Error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.', code: 'upstream_down' },
      { status: 500 },
    )
  }
}
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { callFastFirst } from '@/lib/llm'
import { checkLimit } from '@/lib/ratelimit'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Schema generation is non-interactive — allow the full retry ladder.
export const maxDuration = 60

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h') })
  : null

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'bad_request' }, { status: 401 })
  }

  // Rate limit: 10 form creations per user per hour
  if (ratelimit) {
    const allowed = await checkLimit(ratelimit, `create_form_${user.id}`)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many forms created. Try again later.', code: 'rate_limited' }, { status: 429 })
    }
  }

  const body = await req.json()
  const { prompt, tone, context } = body as { prompt?: string; tone?: string; context?: string }

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required', code: 'bad_request' }, { status: 400 })
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ error: 'Prompt too long (max 2000 characters)', code: 'bad_request' }, { status: 400 })
  }

  const { data: keys } = await supabase
    .from('user_keys')
    .select('groq_key')
    .eq('user_id', user.id)
    .single()

  const groqKeys = [
    keys?.groq_key,
    process.env.GROQ_KEY,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
  ].filter(Boolean) as string[]
  const effectiveCerebrasKey = process.env.CEREBRAS_API_KEY || null

  if (groqKeys.length === 0 && !effectiveCerebrasKey && !process.env.GEMINI_KEY) {
    return NextResponse.json({ error: 'No AI keys configured. Add a Groq key in Settings.', code: 'no_keys' }, { status: 400 })
  }

  try {
    const toneNote = tone ? `\nThe form's conversational tone will be "${tone}".` : ''
    const contextNote = context ? `\nBackground from the creator (use it to sharpen the title, description, and welcome): ${context}` : ''

    const systemInstruction = `You are a form schema generation assistant. Convert the user's natural language description into a structured JSON form schema.
${toneNote}${contextNote}

AVAILABLE FIELD TYPES — choose the most appropriate one for each field:
- "text"     → Short single-line answer (name, city, company, etc.)
- "textarea" → Long paragraphs or open-ended answers
- "number"   → Numeric values (age, salary, score, year, etc.)
- "email"    → Email address fields
- "phone"    → Phone or mobile number fields
- "mcq"      → Multiple choice / single select. MUST include an "options" array of strings. Use this for:
               * Yes/No or boolean questions (options: ["Yes", "No"])
               * Predefined category choices (degree type, department, city, etc.)
               * Rating scales (e.g. options: ["1","2","3","4","5"])
               * Any field where the user picks from a fixed list
- "file"     → File or document upload (resume, photo, ID, etc.)

RULES:
1. For "mcq" fields you MUST include "options": ["Choice A", "Choice B", ...]. Never leave options empty.
2. If a question is a simple Yes/No or true/false → use "mcq" with options: ["Yes", "No"].
3. If the prompt mentions choosing between a fixed set of items → use "mcq".
4. Never use "text" when "mcq" or "number" is more appropriate.
5. "required" should be true unless the question is clearly optional.
6. "welcome_message" is the spoken opening of the conversation: TWO short, warm sentences. Sentence 1 thanks them and names what this is about specifically ("Hi! Thank you so much for your interest in the GDG orientation."). Sentence 2 sets the expectation ("We'll ask a few quick questions to get to know you better."). No emojis, no markdown, no questions, written for the ear.

BRANCHING (only when the prompt implies conditional flow — "if they say no, ask why", follow-ups that only apply to some answers, early exits):
- A field may carry "branches": routing for what comes AFTER it is answered.
- On "mcq": [{ "option": "No", "goto": "<exact label of a LATER field>" }] — per-option routing. "goto" is the exact label of a field that appears LATER in the array, or the string "end" to finish the form early. Options without a branch just continue to the next field.
- On any other type: exactly one rule with "option": "*" — e.g. [{ "option": "*", "goto": "end" }] means "after this question, end". Use this on the LAST question of a side-branch so it doesn't spill into the other branch's questions.
- LAYOUT PATTERN (follow exactly): put the DEFAULT/main path's questions immediately after the branching mcq (they need NO rule — unrouted options fall through to the next field), and the side-branch questions AFTER the main path's. Give the side branch's last question {"option": "*", "goto": "end"} only if it isn't the final field. Double-check every option lands on a question that makes sense for that answer.
- Most forms need NO branches at all. Never invent conditions the prompt doesn't imply.

OUTPUT — strictly valid JSON only, no markdown fences. Example (an RSVP where "No" skips to a why-not question; "Yes" falls through to the main path):
{
  "title": "Launch Party RSVP",
  "description": "Short description",
  "welcome_message": "Hi! Thank you so much for your interest in our launch party. We'll ask a few quick questions to get to know you better.",
  "fields": [
    { "label": "Full Name", "field_type": "text", "required": true },
    { "label": "Will you be attending?", "field_type": "mcq", "required": true, "options": ["Yes", "No"], "branches": [{ "option": "No", "goto": "What's keeping you away?" }] },
    { "label": "Any dietary preferences?", "field_type": "text", "required": false, "branches": [{ "option": "*", "goto": "end" }] },
    { "label": "What's keeping you away?", "field_type": "textarea", "required": false }
  ]
}`

    const responseText = await callFastFirst(
      groqKeys,
      effectiveCerebrasKey,
      systemInstruction,
      "User's form description: " + prompt,
      { perCallTimeoutMs: 10000, geminiRetries: 2 },
    )

    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const schema = JSON.parse(cleaned)

    // Convert AI "branches" (label-based — LLMs are terrible at index math)
    // into editor logic_rules (clientKey-based), sanitizing hard: forward-only
    // targets, known options, "*" only on non-mcq. Anything invalid is
    // silently dropped — a flat form is always a safe fallback.
    const rawFields: any[] = Array.isArray(schema.fields) ? schema.fields : []
    const clientKeys = rawFields.map(() => crypto.randomUUID())
    const targetIndex = (goto: unknown, from: number): number | null => {
      if (typeof goto !== 'string') return null
      const label = goto.trim().toLowerCase()
      const idx = rawFields.findIndex((f, k) => k > from && typeof f?.label === 'string' && f.label.trim().toLowerCase() === label)
      return idx > from ? idx : null
    }
    schema.fields = rawFields.map((f: any, i: number) => {
      const { branches, ...rest } = f ?? {}
      const options: string[] = Array.isArray(rest.options) ? rest.options : []
      const isMcq = rest.field_type === 'mcq'
      const rules = (Array.isArray(branches) ? branches : [])
        .filter((b: any) => b && typeof b.option === 'string')
        .filter((b: any) => b.option === '*'
          ? true
          : isMcq && options.some(o => typeof o === 'string' && o.trim().toLowerCase() === b.option.trim().toLowerCase()))
        .map((b: any) => {
          const goto = b.goto ?? b.goto_index
          if (goto === 'end') return { option: b.option, goto: 'end' }
          const idx = targetIndex(goto, i)
          return { option: b.option, goto: idx !== null ? clientKeys[idx] : null }
        })
        .filter((r: any) => r.goto !== null)
      return {
        ...rest,
        clientKey: clientKeys[i],
        ...(rules.length > 0 ? { logic_rules: rules } : {}),
      }
    })

    return NextResponse.json({ schema })
  } catch (err: any) {
    console.error('Create-form generation error:', err)
    return NextResponse.json({ error: 'Failed to generate form. Please try again.', code: 'upstream_down' }, { status: 502 })
  }
}

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

OUTPUT — strictly valid JSON only, no markdown fences:
{
  "title": "Form Title",
  "description": "Short description",
  "welcome_message": "Hi! Thank you so much for your interest in our beta. We'll ask a few quick questions to get to know you better.",
  "fields": [
    { "label": "Full Name", "field_type": "text", "required": true },
    { "label": "Are you currently employed?", "field_type": "mcq", "required": true, "options": ["Yes", "No"] },
    { "label": "Preferred Degree", "field_type": "mcq", "required": true, "options": ["BTech", "BBA", "BDes"] },
    { "label": "Upload Resume", "field_type": "file", "required": false }
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

    return NextResponse.json({ schema })
  } catch (err: any) {
    console.error('Create-form generation error:', err)
    return NextResponse.json({ error: 'Failed to generate form. Please try again.', code: 'upstream_down' }, { status: 502 })
  }
}

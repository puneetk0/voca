import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: keys } = await supabase.from('user_keys').select('gemini_key').eq('user_id', user.id).single()

  if (!keys?.gemini_key) {
    return NextResponse.json({ error: 'Gemini API Key not configured in Onboarding' }, { status: 400 })
  }

  const { prompt } = await req.json()

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  try {
    const genAI = new GoogleGenerativeAI(keys.gemini_key)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    const systemInstruction = `You are a form schema generation assistant. Convert the user's natural language description into a structured JSON form schema.

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

OUTPUT — strictly valid JSON only, no markdown fences:
{
  "title": "Form Title",
  "description": "Short description",
  "fields": [
    { "label": "Full Name", "field_type": "text", "required": true },
    { "label": "Are you currently employed?", "field_type": "mcq", "required": true, "options": ["Yes", "No"] },
    { "label": "Preferred Degree", "field_type": "mcq", "required": true, "options": ["BTech", "BBA", "BDes"] },
    { "label": "Upload Resume", "field_type": "file", "required": false }
  ]
}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemInstruction + "\n\nUser's form description: " + prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    })

    const responseText = result.response.text()
    const schema = JSON.parse(responseText)

    return NextResponse.json({ schema })
  } catch (err: any) {
    console.error('Gemini API Error:', err)
    return NextResponse.json({ error: err.message || 'Failed to generate form schema' }, { status: 500 })
  }
}

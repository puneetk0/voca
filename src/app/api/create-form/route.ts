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

    const systemInstruction = `You are a form schema generation assistant. Convert the user's natural language input into a structured JSON form schema. The output MUST be strictly valid JSON. 
Use this exact JSON structure:
{
  "title": "Form Title",
  "description": "Short description",
  "fields": [
    { "label": "Full Name", "field_type": "text", "required": true }
  ]
}
Valid field_type values: 'text', 'number', 'email', 'textarea'.`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemInstruction + "\n\nUser input: " + prompt }] }],
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

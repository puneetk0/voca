import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { GoogleGenerativeAI } from '@google/generative-ai'
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

    // 2. Fetch admin's Gemini Key (bypassing RLS)
    const { data: keys } = await supabaseAdmin.from('user_keys').select('gemini_key').eq('user_id', form.user_id).single()
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

    // 4. Gemini Call
    const genAI = new GoogleGenerativeAI(keys.gemini_key)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    let systemInstruction = `You are a conversational AI acting as a friendly assistant collecting data for a form titled "${form.title}".
Your goal is to parse the user's latest response to extract the value for the current field, and then subtly transition into asking them for the NEXT field, acting naturally like a human conversation.
DO NOT use generic robotic acknowledgements (like "Great!", "Okay!", "Noted"). React naturally to what they said.
Decline to answer unrelated questions and gently guide them back to the form.

The current field you asked for is: "${currentField.label}" (Type: ${currentField.field_type}).
`

    if (!isLastField) {
      const nextField = fields[currentFieldIndex + 1]
      systemInstruction += `If their answer is valid, extract the value, and then naturally ask them for the NEXT field: "${nextField.label}" (Type: ${nextField.field_type}).\n`
    } else {
      systemInstruction += `This is the LAST field. If their answer is valid, extract the value, and warmly wrap up the conversation.\n`
    }

    systemInstruction += `
If the user's answer is completely invalid for the requested type (e.g., they gave a word instead of a number for Age), DO NOT extract the value. Instead, naturally ask them to clarify it.

You MUST reply with ONLY a JSON object in this exact format:
{
  "extractedValue": "extracted string value, OR null if invalid/unanswered",
  "aiMessage": "Your natural next conversational response"
}
`

    // Convert history format
    let fullContext = history.map((m: any) => `${m.role === 'ai' ? 'Assistant' : 'User'}: ${m.text}`).join('\n')
    fullContext += `\nUser: ${userMessage}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemInstruction + "\n\nConversation so far:\n" + fullContext }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    })

    const responseText = result.response.text()
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

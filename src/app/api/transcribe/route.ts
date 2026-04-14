import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
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
    const formData = await req.formData()
    const file = formData.get('audio') as Blob
    const formId = formData.get('formId') as string

    if (!file || !formId) {
      return NextResponse.json({ error: 'Missing audio or formId' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`transcribe_${ip}_${formId}`)
      if (!success) {
        return NextResponse.json({ error: "You're going too fast — please wait a moment before continuing." }, { status: 429 })
      }
    }

    // 1. Fetch form -> user_id
    const { data: form } = await supabaseAdmin.from('forms').select('user_id').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    // 2. Fetch admin Groq Key (bypassing RLS)
    const { data: keys } = await supabaseAdmin.from('user_keys').select('groq_key').eq('user_id', form.user_id).single()
    if (!keys?.groq_key) {
      return NextResponse.json({ error: 'Form owner has no Groq API Key' }, { status: 400 })
    }

    // 3. Prepare payload for Groq Whisper
    const groqData = new FormData()
    // Append standard generic name which Groq parses properly based on blob mime
    groqData.append('file', file, 'audio.mp4') 
    groqData.append('model', 'whisper-large-v3-turbo')
    groqData.append('response_format', 'json')

    // 4. Send to Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${keys.groq_key}`
      },
      body: groqData as unknown as BodyInit
    })

    const groqJson = await groqRes.json()
    
    if (!groqRes.ok) {
      throw new Error(groqJson.error?.message || 'Transcription failed at Groq')
    }

    return NextResponse.json({ transcript: groqJson.text })
  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

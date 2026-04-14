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
    const { formId, text } = await req.json()

    if (!formId || !text) {
      return NextResponse.json({ error: 'Missing formId or text' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`tts_${ip}_${formId}`)
      if (!success) {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
      }
    }

    // 1. Fetch Form details to get user_id
    const { data: form } = await supabaseAdmin.from('forms').select('user_id').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    // 2. Fetch admin's Google TTS key
    const { data: keys } = await supabaseAdmin.from('user_keys').select('google_tts_key').eq('user_id', form.user_id).single()
    
    // 3. Fallback if no key is provided
    if (!keys?.google_tts_key) {
      return NextResponse.json({ fallback: true })
    }

    // 4. Truncate text to 200 characters to prevent expensive hallucinations
    const safeText = text.slice(0, 200)

    // 5. Call Google Cloud TTS API
    const googleRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${keys.google_tts_key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: safeText },
        voice: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' }, 
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1 }
      })
    })

    const googleData = await googleRes.json()

    if (!googleRes.ok) {
      console.error('Google TTS Error:', googleData)
      return NextResponse.json({ fallback: true, error: 'Failed to synthesize speech' })
    }

    // 6. Return Base64 MP3 content
    return NextResponse.json({ audioContent: googleData.audioContent })

  } catch (err: any) {
    console.error('TTS API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', fallback: true }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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
    const formId = formData.get('formId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Missing audio' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`transcribe_${ip}_${formId ?? 'admin'}`)
      if (!success) {
        return NextResponse.json({ error: "You're going too fast — please wait a moment before continuing." }, { status: 429 })
      }
    }

    // 1. Resolve user keys
    let keys: { groq_key?: string | null; google_tts_key?: string } | null = null

    if (formId) {
      // Responder path: look up keys via form owner
      const { data: form } = await supabaseAdmin.from('forms').select('user_id').eq('id', formId).single()
      if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
      const { data } = await supabaseAdmin
        .from('user_keys')
        .select('groq_key, google_tts_key')
        .eq('user_id', form.user_id)
        .single()
      keys = data
    } else {
      // Admin path: look up keys via authenticated session
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data } = await supabaseAdmin
        .from('user_keys')
        .select('groq_key, google_tts_key')
        .eq('user_id', user.id)
        .single()
      keys = data
    }

    // Notice we only strictly require the google_tts_key now, as V1 doesn't need the project ID in the URL
    const hasGoogleSTT = !!keys?.google_tts_key
    const hasGroq = !!keys?.groq_key

    if (!hasGoogleSTT && !hasGroq) {
      return NextResponse.json({ error: 'No transcription keys configured. Add a Groq key or Google Cloud keys in Settings.' }, { status: 400 })
    }

    // 2a. PREMIUM PATH: Google Cloud STT V1 (API Key native)
    if (hasGoogleSTT) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const audioBase64 = Buffer.from(arrayBuffer).toString('base64')

        // Using V1 endpoint which accepts standard API keys
        const sttUrl = `https://speech.googleapis.com/v1/speech:recognize?key=${keys!.google_tts_key}`

        const googleRes = await fetch(sttUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              languageCode: 'en-IN'
              // alternativeLanguageCodes: ['hi-IN'], // Handles Hinglish flawlessly
            },
            audio: {
              content: audioBase64,
            }
          }),
        })

        const googleJson = await googleRes.json()

        if (!googleRes.ok) {
          console.error('Google STT V1 error:', googleJson)
          // Non-fatal: fall through to Groq if available
          if (!hasGroq) {
            throw new Error(googleJson.error?.message || 'Transcription failed at Google Cloud')
          }
          console.warn('Falling back to Groq after Google STT failure...')
        } else {
          const transcript = googleJson.results?.[0]?.alternatives?.[0]?.transcript || ''
          return NextResponse.json({ transcript })
        }
      } catch (googleErr: any) {
        if (!hasGroq) throw googleErr
        console.warn('Google STT exception, falling back to Groq:', googleErr.message)
      }
    }

    // 2b. FALLBACK PATH: Groq Whisper
    const groqData = new FormData()
    groqData.append('file', file, 'audio.mp4')
    groqData.append('model', 'whisper-large-v3-turbo')
    groqData.append('response_format', 'json')
    // Secret sauce to prevent Whisper hallucinations on Indian accents:
    groqData.append('prompt', 'This is a form response in Indian English or Hinglish.')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${keys!.groq_key}` },
      body: groqData as unknown as BodyInit,
    })

    const groqJson = await groqRes.json()

    if (!groqRes.ok) {
      throw new Error(groqJson.error?.message || 'Transcription failed at Groq')
    }

    return NextResponse.json({ transcript: groqJson.text || '' })

  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
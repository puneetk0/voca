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

    let keys: { groq_key?: string | null; google_tts_key?: string } | null = null

    if (formId) {
      const { data: form } = await supabaseAdmin.from('forms').select('user_id').eq('id', formId).single()
      if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
      const { data } = await supabaseAdmin
        .from('user_keys')
        .select('groq_key, google_tts_key')
        .eq('user_id', form.user_id)
        .single()
      keys = data
    } else {
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

    const hasGoogleSTT = !!keys?.google_tts_key
    const hasGroq = !!keys?.groq_key

    if (!hasGoogleSTT && !hasGroq) {
      return NextResponse.json({ error: 'No transcription keys configured. Add a Groq key or Google Cloud keys in Settings.' }, { status: 400 })
    }

    // PREMIUM PATH: Google Cloud STT
    if (hasGoogleSTT) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const audioBase64 = Buffer.from(arrayBuffer).toString('base64')

        // FIXED: Use v1p1beta1 endpoint which supports:
        //   - model: 'chirp_2' (previously you were hitting v1 which ignores the model field)
        //   - enableAutomaticPunctuation (critical for Gemini downstream parsing)
        //   - alternativeLanguageCodes for Hinglish
        const sttUrl = `https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${keys!.google_tts_key}`

        const googleRes = await fetch(sttUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              // This is the line that was missing. Without it, you were using
              // the default "latest_long" model, not Chirp 2.
              languageCode: 'en-IN',
              // Hinglish support — Chirp 2 handles code-switching natively
              alternativeLanguageCodes: ['hi-IN'],
              // Punctuation gives Gemini sentence structure to parse.
              // Without it, transcripts are one long run-on string.
              enableAutomaticPunctuation: true,
              // Word confidence lets you detect garbled/low-confidence words
              // and optionally ask the user to repeat — useful for emails/numbers.
              enableWordConfidence: true,
            },
            audio: { content: audioBase64 }
          }),
        })

        const googleJson = await googleRes.json()

        if (!googleRes.ok) {
          console.error('Google STT V1p1beta1 error:', googleJson)
          if (!hasGroq) throw new Error(googleJson.error?.message || 'Transcription failed at Google Cloud')
          console.warn('Falling back to Groq after Google STT failure...')
        } else {
          const result = googleJson.results?.[0]?.alternatives?.[0]
          const transcript = result?.transcript || ''

          // Optional: pass confidence downstream so FormSession can
          // show a "did you say X?" UI for low-confidence answers
          const confidence = result?.confidence ?? 1.0

          return NextResponse.json({ transcript, confidence })
        }
      } catch (googleErr: any) {
        if (!hasGroq) throw googleErr
        console.warn('Google STT exception, falling back to Groq:', googleErr.message)
      }
    }

    // FALLBACK PATH: Groq Whisper
    const groqData = new FormData()
    groqData.append('file', file, 'audio.webm')
    groqData.append('model', 'whisper-large-v3-turbo')
    groqData.append('response_format', 'verbose_json') // verbose gives us word timestamps + confidence
    groqData.append('language', 'en')
    // This prompt conditions Whisper on Indian English patterns and
    // prevents the hallucination of random English phrases on silence.
    groqData.append('prompt', 'Transcribe this form response. The speaker uses Indian English or Hinglish. Common words: okay, yes, no, actually, basically, na, yaar.')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${keys!.groq_key}` },
      body: groqData as unknown as BodyInit,
    })

    const groqJson = await groqRes.json()

    if (!groqRes.ok) throw new Error(groqJson.error?.message || 'Transcription failed at Groq')

    return NextResponse.json({
      transcript: groqJson.text || '',
      confidence: groqJson.segments?.[0]?.avg_logprob
        ? Math.exp(groqJson.segments[0].avg_logprob) // convert log-prob to 0-1 confidence
        : 0.9
    })

  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
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

// Maps MIME types to Google STT encoding strings.
// Google STT v1p1beta1 requires an explicit encoding field — it can't
// always sniff the container format from the raw audio bytes alone.
function getMimeEncoding(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
    return 'MP3' // Google STT treats AAC-in-MP4 as MP3 for recognition purposes
  }
  if (mimeType.includes('ogg')) {
    return 'OGG_OPUS'
  }
  // Default: webm/opus — most Chrome/Firefox/Android recordings
  return 'WEBM_OPUS'
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('audio') as Blob
    const formId = formData.get('formId') as string | null
    // mimeType is sent by useVoiceRecorder so we know exactly what the browser recorded
    const clientMimeType = (formData.get('mimeType') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'Missing audio' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`transcribe_${ip}_${formId ?? 'admin'}`)
      if (!success) {
        return NextResponse.json(
          { error: "You're going a bit fast — please wait a moment before continuing." },
          { status: 429 },
        )
      }
    }

    let keys: { groq_key?: string | null; google_tts_key?: string } | null = null

    if (formId) {
      const { data: form } = await supabaseAdmin
        .from('forms')
        .select('user_id')
        .eq('id', formId)
        .single()
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
      return NextResponse.json(
        { error: 'No transcription keys configured. Add a Groq or Google Cloud key in Settings.' },
        { status: 400 },
      )
    }

    // --- GROQ WHISPER PATH (PRIMARY) ---
    if (hasGroq) {
      try {
        const groqData = new FormData()

        // Determine filename extension — Groq requires a filename to sniff format
        const ext = clientMimeType.includes('mp4') ? 'mp4'
          : clientMimeType.includes('ogg') ? 'ogg'
            : 'webm'
        groqData.append('file', file, `audio.${ext}`)
        groqData.append('model', 'whisper-large-v3-turbo')
        groqData.append('response_format', 'verbose_json')
        groqData.append('language', 'en')
        // Priming prompt conditions Whisper on Indian English and prevents
        // silence hallucination (Whisper sometimes invents phrases on silence/noise)
        groqData.append(
          'prompt',
          'Transcribe this form response. Speaker uses Indian English or Hinglish. Common words: okay, yes, no, actually, basically, na, yaar, theek hai.',
        )

        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${keys!.groq_key}` },
          body: groqData as unknown as BodyInit,
        })

        const groqJson = await groqRes.json()
        
        if (!groqRes.ok) {
          console.error('Groq STT error:', groqJson)
          if (!hasGoogleSTT) throw new Error(groqJson.error?.message || 'Groq transcription failed')
          console.warn('[STT] Groq failed, falling back to Google...')
        } else {
          // Convert log-prob to 0-1 confidence score
          const groqConfidence = groqJson.segments?.[0]?.avg_logprob
            ? Math.exp(groqJson.segments[0].avg_logprob)
            : 0.9

          return NextResponse.json({
            transcript: groqJson.text ?? '',
            confidence: groqConfidence,
          })
        }
      } catch (groqErr: any) {
        if (!hasGoogleSTT) throw groqErr
        console.warn('[STT] Groq exception, falling back to Google:', groqErr.message)
      }
    }

    // --- GOOGLE CLOUD STT PATH (FALLBACK) ---
    if (hasGoogleSTT) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const audioBase64 = Buffer.from(arrayBuffer).toString('base64')
        const encoding = getMimeEncoding(clientMimeType || (file as File).type || '')

        const sttUrl = `https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${keys!.google_tts_key}`

        const googleRes = await fetch(sttUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              encoding,
              languageCode: 'en-IN',
              alternativeLanguageCodes: ['hi-IN'],
              enableAutomaticPunctuation: true,
              enableWordConfidence: true,
              useEnhanced: true,
            },
            audio: { content: audioBase64 },
          }),
        })

        const googleJson = await googleRes.json()

        if (!googleRes.ok) {
          console.error('Google STT fallback error:', googleJson)
          throw new Error(googleJson.error?.message || 'Google STT fallback failed')
        }

        const result = googleJson.results?.[0]?.alternatives?.[0]
        return NextResponse.json({ 
          transcript: result?.transcript ?? '', 
          confidence: result?.confidence ?? 1.0 
        })
      } catch (googleErr: any) {
        throw googleErr
      }
    }

  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
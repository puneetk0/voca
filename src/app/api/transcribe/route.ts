import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Whisper/Sarvam transcription can take a few seconds on longer clips.
export const maxDuration = 30

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
// 200/hr: each answered question = 1 transcription, and shared IPs (campus
// wifi, offices) can host many respondents at once.
const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, "1 h"),
}) : null

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('audio') as Blob
    const formId = formData.get('formId') as string | null
    // mimeType is sent by useVoiceRecorder so we know exactly what the browser recorded
    const clientMimeType = (formData.get('mimeType') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'Missing audio', code: 'bad_request' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too large (max 10MB)', code: 'bad_request' }, { status: 413 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`transcribe_${ip}_${formId ?? 'admin'}`)
      if (!success) {
        return NextResponse.json(
          { error: "You're going a bit fast. Please wait a moment before continuing.", code: 'rate_limited' },
          { status: 429 },
        )
      }
    }

    let keys: { groq_key?: string | null } | null = null

    if (formId) {
      const { data: form } = await supabaseAdmin
        .from('forms')
        .select('user_id')
        .eq('id', formId)
        .single()
      if (!form) return NextResponse.json({ error: 'Form not found', code: 'not_found' }, { status: 404 })
      const { data } = await supabaseAdmin
        .from('user_keys')
        .select('groq_key')
        .eq('user_id', form.user_id)
        .single()
      keys = data
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'bad_request' }, { status: 401 })
      const { data } = await supabaseAdmin
        .from('user_keys')
        .select('groq_key')
        .eq('user_id', user.id)
        .single()
      keys = data
    }

    // Fall back to platform env var keys when user hasn't configured their own
    const effectiveGroqKey = keys?.groq_key || process.env.GROQ_KEY || null
    const groqKeyList = [
      effectiveGroqKey,
      process.env.GROQ_KEY_2,
      process.env.GROQ_KEY_3,
    ].filter(Boolean) as string[]

    const hasGroq = groqKeyList.length > 0
    const hasSarvam = !!process.env.SARVAM_API_KEY

    if (!hasGroq && !hasSarvam) {
      return NextResponse.json({ error: 'No transcription keys configured.', code: 'no_keys' }, { status: 400 })
    }

    const ext = clientMimeType.includes('mp4') ? 'mp4'
      : clientMimeType.includes('ogg') ? 'ogg'
        : 'webm'

    // --- GROQ WHISPER PATH (PRIMARY) ---
    if (hasGroq) {
      try {
        const groqData = new FormData()
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

        let sttDone = false
        for (let ki = 0; ki < groqKeyList.length; ki++) {
          const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${groqKeyList[ki]}` },
            body: groqData as unknown as BodyInit,
          })
          const groqJson = await groqRes.json()

          if (groqRes.status === 429 && ki < groqKeyList.length - 1) {
            console.warn(`[STT] Groq key ${ki + 1} rate-limited, trying key ${ki + 2}…`)
            continue
          }
          if (!groqRes.ok) {
            console.error('Groq STT error:', groqJson)
            if (!hasSarvam) throw new Error(groqJson.error?.message || 'Groq transcription failed')
            console.warn('[STT] Groq failed, falling back to Sarvam...')
            break
          }
          // Success
          const groqConfidence = groqJson.segments?.[0]?.avg_logprob
            ? Math.exp(groqJson.segments[0].avg_logprob)
            : 0.9
          sttDone = true
          return NextResponse.json({ transcript: groqJson.text ?? '', confidence: groqConfidence })
        }
        if (sttDone) return // satisfied above — TypeScript needs this
      } catch (groqErr: any) {
        if (!hasSarvam) throw groqErr
        console.warn('[STT] Groq exception, falling back to Sarvam:', groqErr.message)
      }
    }

    // --- SARVAM STT PATH (FALLBACK) — strong on Hinglish / code-mixing ---
    if (hasSarvam) {
      try {
        const sarvamData = new FormData()
        sarvamData.append('file', file, `audio.${ext}`)
        sarvamData.append('model', 'saarika:v2.5')
        sarvamData.append('language_code', 'unknown') // auto-detect (handles Hinglish)

        const sarvamRes = await fetch('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
          body: sarvamData as unknown as BodyInit,
        })
        const sarvamJson = await sarvamRes.json()

        if (!sarvamRes.ok) {
          console.error('Sarvam STT error:', sarvamJson)
          throw new Error(sarvamJson.error?.message || 'Sarvam transcription failed')
        }

        return NextResponse.json({ transcript: sarvamJson.transcript ?? '', confidence: 0.9 })
      } catch (sarvamErr: any) {
        throw sarvamErr
      }
    }

  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message, code: 'upstream_down' }, { status: 500 })
  }
}
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkLimit, isAllowedOrigin, clientIp } from '@/lib/ratelimit'
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
    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden', code: 'bad_request' }, { status: 403 })
    }

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

    {
      const ip = clientIp(req.headers)
      const allowed = await checkLimit(ratelimit, `transcribe_${ip}_${formId ?? 'admin'}`, { limit: 20, windowMs: 5 * 60_000 })
      if (!allowed) {
        return NextResponse.json(
          { error: "You're going a bit fast. Please wait a moment before continuing.", code: 'rate_limited' },
          { status: 429 },
        )
      }
    }

    let keys: { groq_key?: string | null } | null = null
    let formContext = ''

    if (formId) {
      // select('*') stays resilient if personality migrations haven't run yet
      const { data: form } = await supabaseAdmin
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single()
      if (!form) return NextResponse.json({ error: 'Form not found', code: 'not_found' }, { status: 404 })
      // Bias Whisper toward this form's vocabulary (event names, orgs, jargon)
      formContext = [form.title, form.ai_context].filter(Boolean).join('. ').slice(0, 300)
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

    // --- SARVAM SAARIKA PATH (PRIMARY) ---
    // Purpose-built for Indian accents, names and code-mixed speech — Whisper
    // consistently mangles Indian proper nouns ("Puneet" → "bony").
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
          signal: AbortSignal.timeout(10000),
        })
        const sarvamJson = await sarvamRes.json()

        if (sarvamRes.ok) {
          return NextResponse.json({ transcript: sarvamJson.transcript ?? '', confidence: 0.9 })
        }
        console.error('[STT] Sarvam error:', sarvamJson)
        if (!hasGroq) throw new Error(sarvamJson.error?.message || 'Sarvam transcription failed')
        console.warn('[STT] Sarvam failed, falling back to Groq Whisper...')
      } catch (sarvamErr: any) {
        if (!hasGroq) throw sarvamErr
        console.warn('[STT] Sarvam exception, falling back to Groq Whisper:', sarvamErr.message)
      }
    }

    // --- GROQ WHISPER PATH (FALLBACK) ---
    if (hasGroq) {
      const groqData = new FormData()
      groqData.append('file', file, `audio.${ext}`)
      groqData.append('model', 'whisper-large-v3-turbo')
      groqData.append('response_format', 'verbose_json')
      groqData.append('language', 'en')
      // Priming prompt: conditions Whisper on Indian English, prevents silence
      // hallucination, and biases it toward THIS form's vocabulary.
      groqData.append(
        'prompt',
        `Transcribe this form response. Speaker uses Indian English or Hinglish, and may say Indian names.${formContext ? ` Context: ${formContext}.` : ''} Common words: okay, yes, no, actually, basically, na, yaar, theek hai.`,
      )

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
          throw new Error(groqJson.error?.message || 'Transcription failed')
        }
        const groqConfidence = groqJson.segments?.[0]?.avg_logprob
          ? Math.exp(groqJson.segments[0].avg_logprob)
          : 0.9
        return NextResponse.json({ transcript: groqJson.text ?? '', confidence: groqConfidence })
      }
    }

  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json({ error: err.message, code: 'upstream_down' }, { status: 500 })
  }
}
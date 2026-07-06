import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkLimit, isAllowedOrigin, clientIp } from '@/lib/ratelimit'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export const maxDuration = 30

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, "1 h"),
}) : null

// Speakability normalizer. Bulbul v3 accepts up to 2500 chars per request, so
// there is NO aggressive truncation here (a leftover 280-char cut used to
// mutilate long welcome messages mid-sentence). We only trim past a generous
// 2000-char safety cap, at a sentence boundary.
const MAX_TTS_CHARS = 2000

function cleanText(text: string): string {
  let t = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/[—–]/g, ', ')
    // Emails read terribly as raw tokens — speak them ("x at y dot com").
    .replace(/\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})\b/g, (_m, u, d, tld) =>
      `${u} at ${d.replace(/\./g, ' dot ')} dot ${tld}`)
    // Strip emojis / pictographs — they become noise or get spoken literally.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (t.length > MAX_TTS_CHARS) {
    const breakPoints = [...t.matchAll(/[.!?]\s/g)]
    const lastBreak = [...breakPoints].reverse().find(m => (m.index ?? 0) < MAX_TTS_CHARS)
    if (lastBreak && lastBreak.index !== undefined) {
      t = t.slice(0, lastBreak.index + 1)
    } else {
      const lastSpace = t.lastIndexOf(' ', MAX_TTS_CHARS)
      t = lastSpace > 0 ? t.slice(0, lastSpace) : t.slice(0, MAX_TTS_CHARS)
    }
  }

  return t
}

export async function POST(req: Request) {
  try {
    // Same-origin gate + body cap before doing anything billable
    if (!isAllowedOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden', code: 'bad_request' }, { status: 403 })
    }
    const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
    if (contentLength > 16 * 1024) {
      return NextResponse.json({ error: 'Payload too large', code: 'bad_request' }, { status: 413 })
    }

    const { formId, text, language } = await req.json()
    const lang: 'hi' | 'en' = language === 'en' ? 'en' : 'hi'

    if (!formId || !text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing formId or text', code: 'bad_request' }, { status: 400 })
    }
    // Sarvam bills per character — refuse anything beyond a real message size
    if (text.length > 3000) {
      return NextResponse.json({ error: 'Text too long', code: 'bad_request' }, { status: 413 })
    }

    const ip = clientIp(req.headers)
    const allowed = await checkLimit(ratelimit, `tts_${ip}_${formId}`, { limit: 60, windowMs: 5 * 60_000 })
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', code: 'rate_limited' }, { status: 429 })
    }

    // select('*') stays resilient if migration 0002 hasn't run yet
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()
    if (!form) return NextResponse.json({ error: 'Form not found', code: 'not_found' }, { status: 404 })
    if (!form.is_active) {
      // Owner bypass: allow the creator to preview a paused form.
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== form.user_id) {
        return NextResponse.json({ error: 'This form is closed.', code: 'form_closed' }, { status: 403 })
      }
    }

    const speakable = cleanText(text)

    // Priority 1: Sarvam bulbul:v3 — natural prosody, best-in-class on
    // abbreviations, numerics and code-mixing.
    //
    // ONE attempt with an 11s ceiling — deliberately no retry. The client
    // aborts the whole /api/tts request at ~13s, so a second 9s Sarvam attempt
    // used to push the server past that window and the client would give up on
    // the (longest) opening line, dropping it to the silent browser voice.
    // A single generous attempt fits inside the client budget and still lets a
    // genuine failure fall through to Orpheus quickly.
    const sarvamKey = process.env.SARVAM_API_KEY
    if (sarvamKey) {
      // Tone shapes delivery: measured and steady for professional,
      // brisker and more expressive for playful.
      const tone: 'professional' | 'friendly' | 'playful' =
        form.ai_tone === 'professional' || form.ai_tone === 'playful' ? form.ai_tone : 'friendly'
      const { pace, temperature } = {
        professional: { pace: 0.95, temperature: 0.4 },
        friendly: { pace: 1.0, temperature: 0.6 },
        playful: { pace: 1.05, temperature: 0.8 },
      }[tone]

      try {
        const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': sarvamKey,
          },
          body: JSON.stringify({
            text: speakable,
            target_language_code: lang === 'en' ? 'en-IN' : 'hi-IN',
            model: 'bulbul:v3',
            speaker: process.env.SARVAM_SPEAKER || 'priya',
            pace,
            temperature,
            speech_sample_rate: 24000,
          }),
          signal: AbortSignal.timeout(11000),
        })

        if (sarvamRes.ok) {
          const sarvamData = await sarvamRes.json()
          const audioContent = sarvamData?.audios?.[0]
          if (audioContent) {
            return NextResponse.json({ audioContent, format: 'wav' })
          }
        } else {
          console.error('[TTS] Sarvam error:', sarvamRes.status, await sarvamRes.text().catch(() => ''))
        }
      } catch (e: any) {
        console.warn('[TTS] Sarvam failed:', e?.message)
      }
    }

    // Priority 2 (English only): Groq Orpheus — a real neural voice on the keys
    // we already have. Far better fallback than the robotic browser engine.
    // NOTE: requires one-time terms acceptance in the Groq console:
    // https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
    if (lang === 'en') {
      const groqKeys = [process.env.GROQ_KEY, process.env.GROQ_KEY_2, process.env.GROQ_KEY_3].filter(Boolean) as string[]
      for (const key of groqKeys) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model: 'canopylabs/orpheus-v1-english',
              voice: process.env.GROQ_TTS_VOICE || 'tara',
              input: speakable,
              response_format: 'wav',
            }),
            signal: AbortSignal.timeout(9000),
          })
          if (groqRes.ok) {
            const buf = Buffer.from(await groqRes.arrayBuffer())
            console.warn('[TTS] Sarvam unavailable — served Groq Orpheus fallback voice')
            return NextResponse.json({ audioContent: buf.toString('base64'), format: 'wav' })
          }
          const body = await groqRes.text().catch(() => '')
          if (body.includes('model_terms_required')) {
            console.error('[TTS] Groq Orpheus needs one-time terms acceptance: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english')
          } else {
            console.error('[TTS] Groq Orpheus error:', groqRes.status, body.slice(0, 200))
          }
          if (groqRes.status !== 429) break // only rate limits advance to the next key
        } catch (e: any) {
          console.warn('[TTS] Groq Orpheus attempt failed:', e?.message)
          break
        }
      }
    }

    // No premium voice available — the client degrades to the browser's built-in
    // speech, then to captions mode.
    return NextResponse.json({ fallback: true })

  } catch (err: any) {
    console.error('TTS API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', fallback: true }, { status: 500 })
  }
}

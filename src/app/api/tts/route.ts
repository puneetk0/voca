import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const url = process.env.UPSTASH_REDIS_REST_URL
const redis = url && url.startsWith('http') ? Redis.fromEnv() : null
const ratelimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, "1 h"),
}) : null

// Strips markdown and truncates at a sentence boundary before 280 chars.
// Shared between Sarvam (plain text) and Google TTS (wrapped in SSML).
function cleanText(text: string): string {
  let t = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/—/g, ', ')

  if (t.length > 280) {
    const breakPoints = [...t.matchAll(/[.!?]\s/g)]
    const lastBreak = [...breakPoints].reverse().find(m => (m.index ?? 0) < 280)
    if (lastBreak && lastBreak.index !== undefined) {
      t = t.slice(0, lastBreak.index + 1)
    } else {
      const lastSpace = t.lastIndexOf(' ', 280)
      t = lastSpace > 0 ? t.slice(0, lastSpace) : t.slice(0, 280)
    }
  }

  return t
}

// HD voices like Chirp3 handle their own expressiveness. Explicit prosody tags
// confuse their intonation model, so we only wrap in <speak>.
function buildSSML(text: string): string {
  return `<speak>${cleanText(text)}</speak>`
}

export async function POST(req: Request) {
  try {
    const { formId, text, language } = await req.json()
    const lang: 'hi' | 'en' = language === 'en' ? 'en' : 'hi'

    if (!formId || !text) {
      return NextResponse.json({ error: 'Missing formId or text' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const { success } = await ratelimit.limit(`tts_${ip}_${formId}`)
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
      }
    }

    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('user_id')
      .eq('id', formId)
      .single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    // Priority 1: Sarvam AI — built for Indian English, warm and natural.
    // Configured via SARVAM_API_KEY env var (no per-user key needed for testing).
    const sarvamKey = process.env.SARVAM_API_KEY
    if (sarvamKey) {
      const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': sarvamKey,
        },
        body: JSON.stringify({
          inputs: [cleanText(text)],
          target_language_code: lang === 'en' ? 'en-IN' : 'hi-IN',
          speaker: 'anushka',
          model: 'bulbul:v2',
          pitch: 0,
          pace: 1.05,
          loudness: 1.5,
          enable_preprocessing: true,
        }),
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
    }

    // Priority 2: Google Cloud TTS — falls back if Sarvam not configured or failed.
    const { data: keys } = await supabaseAdmin
      .from('user_keys')
      .select('google_tts_key')
      .eq('user_id', form.user_id)
      .single()

    if (!keys?.google_tts_key) {
      return NextResponse.json({ fallback: true })
    }

    const googleRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${keys.google_tts_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { ssml: buildSSML(text) },
          voice: {
            languageCode: 'hi-IN',
            name: 'hi-IN-Chirp3-HD-Charon',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 0.95,
            pitch: 0.0,
            volumeGainDb: 1.5,
          },
        }),
      },
    )

    const googleData = await googleRes.json()

    if (!googleRes.ok) {
      console.error('Google TTS Error:', googleData)
      return NextResponse.json({ fallback: true, error: 'Failed to synthesize speech' })
    }

    return NextResponse.json({ audioContent: googleData.audioContent, format: 'mp3' })

  } catch (err: any) {
    console.error('TTS API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', fallback: true }, { status: 500 })
  }
}

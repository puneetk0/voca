import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkLimit } from '@/lib/ratelimit'
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

export const maxDuration = 30

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
    .replace(/[—–]/g, ', ')

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

export async function POST(req: Request) {
  try {
    const { formId, text, language } = await req.json()
    const lang: 'hi' | 'en' = language === 'en' ? 'en' : 'hi'

    if (!formId || !text) {
      return NextResponse.json({ error: 'Missing formId or text', code: 'bad_request' }, { status: 400 })
    }

    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
      const allowed = await checkLimit(ratelimit, `tts_${ip}_${formId}`)
      if (!allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded', code: 'rate_limited' }, { status: 429 })
      }
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

    // Priority 1: Sarvam AI — built for Indian English, warm and natural.
    // Configured via SARVAM_API_KEY env var (no per-user key needed for testing).
    const sarvamKey = process.env.SARVAM_API_KEY
    if (sarvamKey) {
      // Pace tracks the form's tone: measured for professional, brisker for playful.
      const pace = form.ai_tone === 'professional' ? 1.0 : form.ai_tone === 'playful' ? 1.1 : 1.05
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
          pace,
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

    // No premium voice available — the client degrades to the browser's built-in
    // speech, then to captions mode. (Google Cloud TTS was removed.)
    return NextResponse.json({ fallback: true })

  } catch (err: any) {
    console.error('TTS API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', fallback: true }, { status: 500 })
  }
}

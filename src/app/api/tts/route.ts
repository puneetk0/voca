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

// Converts plain AI text into SSML with natural pacing.
// Hard cap is enforced by slicing at a sentence boundary, not a raw character
// index — the old slice(0, 300) could cut mid-tag and produce malformed XML
// that Google TTS would either reject or mangle.
function buildSSML(text: string): string {
  // Strip markdown that Gemini occasionally sneaks in despite instructions
  let t = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/—/g, ', ') // em-dash → comma pause (prompt now bans em-dashes, but be safe)

  // Safe truncation: find the last sentence boundary before 280 chars.
  // 280 leaves headroom for SSML tags without pushing past TTS API limits.
  if (t.length > 280) {
    // Try to break at a sentence end
    const breakPoints = [...t.matchAll(/[.!?]\s/g)]
    const lastBreak = breakPoints.reverse().find(m => (m.index ?? 0) < 280)
    if (lastBreak && lastBreak.index !== undefined) {
      t = t.slice(0, lastBreak.index + 1)
    } else {
      // No sentence boundary found — break at last space before 280
      const lastSpace = t.lastIndexOf(' ', 280)
      t = lastSpace > 0 ? t.slice(0, lastSpace) : t.slice(0, 280)
    }
  }

  // Natural pause after sentence-ending punctuation
  t = t.replace(/\. /g, '.<break time="300ms"/> ')
  t = t.replace(/\? /g, '?<break time="280ms"/> ')
  t = t.replace(/! /g, '!<break time="280ms"/> ')

  // Comma pauses — conversational rhythm
  t = t.replace(/, /g, ',<break time="120ms"/> ')

  // Ellipsis — thoughtful pause
  t = t.replace(/\.\.\./g, '<break time="450ms"/>')

  // Soft prosody on common acknowledgement words so they don't sound clipped
  // These are the ones that survived the prompt rewrite — keep list short.
  const softFillers = ['Okay', 'Alright', 'Sure', 'Right', 'Noted', 'Yep']
  for (const filler of softFillers) {
    const regex = new RegExp(`\\b(${filler}[.,!]?)`, 'gi')
    t = t.replace(regex, `<prosody rate="92%" volume="-1dB">$1</prosody>`)
  }

  return `<speak>${t}</speak>`
}

export async function POST(req: Request) {
  try {
    const { formId, text } = await req.json()

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

    const { data: keys } = await supabaseAdmin
      .from('user_keys')
      .select('google_tts_key')
      .eq('user_id', form.user_id)
      .single()

    if (!keys?.google_tts_key) {
      return NextResponse.json({ fallback: true })
    }

    const ssmlPayload = buildSSML(text)

    const googleRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${keys.google_tts_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { ssml: ssmlPayload },
          voice: {
            languageCode: 'en-IN',
            // Neural2-C: warm, conversational Indian English male voice.
            // Journey voices are better but require v1beta1 endpoint.
            // If you upgrade to v1beta1 later, switch to en-IN-Journey-D (male)
            // or en-IN-Journey-F (female) for noticeably more natural output.
            name: 'en-IN-Neural2-C',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            // 1.1 is slightly faster than natural but not rushed.
            // Neural2 voices at default 1.0 can sound slightly slow for
            // conversational back-and-forth; 1.1 feels more natural for chat.
            speakingRate: 1.1,
            // Slight downward pitch — Neural2-C's default pitch is slightly
            // high; -1.0 brings it closer to natural male register.
            pitch: -1.0,
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

    return NextResponse.json({ audioContent: googleData.audioContent })

  } catch (err: any) {
    console.error('TTS API error:', err)
    return NextResponse.json({ error: 'Internal Server Error', fallback: true }, { status: 500 })
  }
}
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

// Converts plain AI text into natural SSML that sounds like a real person speaking.
// The goal is varied rhythm, not just "faster + lower pitch".
function buildSSML(text: string): string {
  // Strip markdown artifacts that Gemini sometimes sneaks in
  let t = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .slice(0, 300) // Hard cap — TTS over 300 chars sounds like a monologue

  // Natural pause after sentence-ending punctuation
  t = t.replace(/\. /g, '.<break time="350ms"/> ')
  t = t.replace(/\? /g, '?<break time="300ms"/> ')
  t = t.replace(/! /g, '!<break time="300ms"/> ')

  // Comma pauses — shorter, more conversational
  t = t.replace(/, /g, ',<break time="150ms"/> ')

  // Em-dash gets a beat — like a human pausing mid-thought
  t = t.replace(/—/g, '<break time="400ms"/>')

  // Ellipsis gets a thoughtful pause
  t = t.replace(/\.\.\./g, '<break time="500ms"/>')

  // Filler acknowledgements: slightly slower + softer so they don't sound robotic
  // This is the key fix for "Got it. Perfect. Alright." feeling mechanical
  const fillers = ['Got it', 'Alright', 'Sure', 'Of course', 'Okay', 'Right']
  for (const filler of fillers) {
    const regex = new RegExp(`\\b(${filler}[.,!]?)`, 'gi')
    t = t.replace(regex, `<prosody rate="90%" volume="-2dB">$1</prosody>`)
  }

  // Wrap the whole thing with a slightly warmer, slower baseline than default.
  // speakingRate is handled in audioConfig, but a prosody wrapper lets us
  // apply it AFTER the filler-word patches above don't inherit it.
  return `<speak>${t}</speak>`
}

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

    const { data: form } = await supabaseAdmin.from('forms').select('user_id').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    const { data: keys } = await supabaseAdmin.from('user_keys').select('google_tts_key').eq('user_id', form.user_id).single()

    if (!keys?.google_tts_key) {
      return NextResponse.json({ fallback: true })
    }

    const ssmlPayload = buildSSML(text)

    const googleRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${keys.google_tts_key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml: ssmlPayload },
        voice: {
          languageCode: 'en-IN',
          // en-IN-Journey-D is Google's best conversational voice for Indian English.
          // It's built specifically for dialogue — not narration — so it doesn't
          // sound like a GPS or an IVR system. Much warmer than Neural2-C.
          // If you want female: en-IN-Journey-F
          name: 'en-IN-Neural2-C',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          // 0.95 is imperceptibly slower than default but it removes the
          // "reading off a script" cadence that 1.0+ creates.
          speakingRate: 1.15,
          // Flat pitch offsets make voices sound processed. 0.0 lets
          // Journey's natural intonation model do the work.
          pitch: -1.0,
          // Slight volume bump — important for noisy environments
          volumeGainDb: 1.5,
          // OGG_OPUS is lower latency to decode in browser than MP3 and
          // sounds noticeably cleaner at the same bitrate.
          // Switch audioEncoding here AND update your client-side Audio() init
          // to use 'audio/ogg' if you want the upgrade.
          // Keeping MP3 here to avoid breaking existing client code.
        }
      })
    })

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
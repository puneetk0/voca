'use client'

import { useRef, useCallback, useEffect, useState } from 'react'

export type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

const FILLERS: Record<'hi' | 'en', string[]> = {
  hi: ["हाँ...", "अच्छा...", "हम्म...", "ठीक है..."],
  en: ["Hmm...", "Okay...", "Right...", "Got it..."],
}

// Long openers legitimately take Sarvam up to ~11s to synthesize. The server
// makes a single 11s Sarvam attempt, so the client must wait a beat longer than
// that or it would abort mid-synthesis and drop the opening line to the silent
// browser voice. 13s > server's 11s ceiling, with headroom for network.
const TTS_FETCH_TIMEOUT_MS = 13000

export function useTTS(
  formId: string,
  setVoiceState: (s: VoiceState) => void,
  initialLanguage: 'hi' | 'en' = 'en',
) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fillerAudioRef = useRef<string[]>([])
  const fillerFormatRef = useRef<string>('mpeg')
  const fillerCacheRef = useRef<Record<'hi' | 'en', string[]>>({ hi: [], en: [] })
  const languageRef = useRef<'hi' | 'en'>(initialLanguage)
  const isSpeakingRef = useRef(false)

  // Watchdog: guarantees the onEnd callback ALWAYS fires, even if the audio
  // element or speechSynthesis silently dies. Without it, isSpeakingRef can
  // stay true forever and the whole session locks up.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Captions mode: after repeated total audio failures we stop trying to play
  // sound and instead give a silent "reading window" so the loop continues.
  const ttsFailStreakRef = useRef(0)
  const [captionsMode, setCaptionsMode] = useState(false)

  const fetchFillers = useCallback(async (lang: 'hi' | 'en') => {
    const results = await Promise.allSettled(
      FILLERS[lang].map(f =>
        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formId, text: f, language: lang }),
          signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS + 3000),
        }).then(r => r.json()),
      ),
    )
    const ok = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value?.audioContent)
      .map(r => r.value)
    if (ok.length > 0 && ok[0].format) {
      fillerFormatRef.current = ok[0].format === 'wav' ? 'wav' : 'mpeg'
    }
    fillerCacheRef.current[lang] = ok.map(r => r.audioContent)
    return ok.length
  }, [formId])

  // Prefetch ONLY the session's starting language eagerly (halves the request
  // burst against the TTS rate limit); the other language loads on switch.
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const timer = setTimeout(async () => {
      try {
        const count = await fetchFillers(languageRef.current)
        fillerAudioRef.current = fillerCacheRef.current[languageRef.current]
        if (count === 0) {
          console.warn('[TTS] all filler prefetches failed — latency masking disabled, retrying in 30s')
          retryTimer = setTimeout(async () => {
            await fetchFillers(languageRef.current)
            fillerAudioRef.current = fillerCacheRef.current[languageRef.current]
          }, 30000)
        }
      } catch { }
    }, 2000)
    return () => {
      clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId])

  /** Swap the active filler set; lazily fetch it if not cached yet. */
  const switchFillers = useCallback((lang: 'hi' | 'en') => {
    if (fillerCacheRef.current[lang].length > 0) {
      fillerAudioRef.current = fillerCacheRef.current[lang]
    } else {
      fillerAudioRef.current = [] // don't play wrong-language fillers meanwhile
      fetchFillers(lang).then(() => {
        if (languageRef.current === lang) fillerAudioRef.current = fillerCacheRef.current[lang]
      }).catch(() => { })
    }
  }, [fetchFillers])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const killAudio = useCallback(() => {
    // Intentional interruption: silence everything WITHOUT firing onEnd —
    // the caller is starting a new flow and must not get a stale mic-restart.
    clearWatchdog()
    isSpeakingRef.current = false
    window.speechSynthesis?.cancel()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [clearWatchdog])

  const playChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.05, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
      setTimeout(() => ctx.state !== 'closed' && ctx.close().catch(() => {}), 500)
    } catch { }
  }, [])

  const playSmartAudio = useCallback(async (text: string, onEnd: () => void) => {
    isSpeakingRef.current = true
    setVoiceState('speaking')
    window.speechSynthesis?.cancel()
    clearWatchdog()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // Single-fire finalization: every completion path (natural end, error,
    // watchdog) funnels through here exactly once.
    let done = false
    const finalize = (viaWatchdog = false) => {
      if (done) return
      done = true
      clearWatchdog()
      isSpeakingRef.current = false
      if (viaWatchdog) console.warn('[TTS] watchdog fired — audio never signaled completion')
      onEnd()
    }
    const armWatchdog = () => {
      clearWatchdog()
      const budget = Math.max(15000, text.length * 90 + 3000)
      watchdogRef.current = setTimeout(() => finalize(true), budget)
    }

    // Captions mode: no audio at all — give a silent reading window scaled to
    // the text length, then continue the loop.
    if (captionsMode) {
      armWatchdog()
      setTimeout(() => finalize(), Math.max(2500, text.length * 55))
      return
    }

    const speakWithBrowser = () => {
      if (!('speechSynthesis' in window)) {
        ttsFailStreakRef.current++
        if (ttsFailStreakRef.current >= 2) setCaptionsMode(true)
        setTimeout(() => finalize(), Math.max(2500, text.length * 55))
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const wantLang = languageRef.current === 'hi' ? 'hi' : 'en-IN'
      const preferred = voices.find(v => v.lang.includes(wantLang))
        ?? voices.find(v => v.name.toLowerCase().includes('google'))
        ?? null
      if (preferred) utterance.voice = preferred
      utterance.rate = 1.05
      utterance.onend = () => { ttsFailStreakRef.current = 0; finalize() }
      utterance.onerror = () => {
        ttsFailStreakRef.current++
        if (ttsFailStreakRef.current >= 2) setCaptionsMode(true)
        finalize()
      }
      armWatchdog()
      window.speechSynthesis.speak(utterance)
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, text, language: languageRef.current }),
        signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
      })
      const data = await res.json()
      if (data.fallback || data.error || !data.audioContent) throw new Error('fallback')

      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      // Defensive: the element is reused across turns — never inherit a stale
      // rate (this manifested as the voice suddenly "speaking slow").
      audio.playbackRate = 1
      audio.defaultPlaybackRate = 1
      const mimeType = data.format === 'wav' ? 'audio/wav' : 'audio/mpeg'
      audio.src = `data:${mimeType};base64,${data.audioContent}`
      audio.load()
      audio.onended = () => { ttsFailStreakRef.current = 0; finalize() }
      audio.onerror = () => { console.warn('[TTS] playback error, finalizing'); finalize() }
      armWatchdog()
      await audio.play().catch(() => { throw new Error('autoplay blocked') })
    } catch {
      speakWithBrowser()
    }
  }, [formId, setVoiceState, captionsMode, clearWatchdog])

  return {
    audioRef,
    fillerAudioRef,
    fillerFormatRef,
    languageRef,
    isSpeakingRef,
    captionsMode,
    playSmartAudio,
    killAudio,
    playChime,
    switchFillers,
  }
}

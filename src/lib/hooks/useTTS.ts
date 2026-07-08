'use client'

import { useRef, useCallback, useEffect, useState } from 'react'

export type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

// Two fillers per language, not four: each one is a separate TTS request and
// Sarvam's per-key concurrency is small — a 4-request burst at session start
// used to queue BEHIND the opener's own TTS call and delay the first spoken
// words by many seconds.
const FILLERS: Record<'hi' | 'en', string[]> = {
  hi: ["अच्छा...", "ठीक है..."],
  en: ["Okay...", "Got it..."],
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

  // Playback generation: killAudio() and every new playSmartAudio() bump it,
  // which invalidates any pending finalize from an older playback. Without
  // this, speechSynthesis.cancel() during a barge-in fired the OLD utterance's
  // error handler → its stale onEnd re-opened the mic mid-new-turn, and two
  // barge-ins during browser speech falsely latched captions mode.
  const generationRef = useRef(0)

  // 1-entry TTS synthesis cache (see playSmartAudio) — avoids paying Sarvam
  // twice for the same text (mobile autoplay replay, empty-capture reprompt).
  const lastTtsRef = useRef<{ text: string; lang: 'hi' | 'en'; src: string } | null>(null)

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

  // Filler prefetch is DEFERRED until the first real speech has finished (or a
  // 15s fallback) so it never competes with the opener's TTS call for Sarvam's
  // limited concurrency — that contention was a major cause of 20-30s starts.
  const prefetchStartedRef = useRef(false)
  const ensureFillers = useCallback(() => {
    if (prefetchStartedRef.current) return
    prefetchStartedRef.current = true
    fetchFillers(languageRef.current)
      .then(count => {
        fillerAudioRef.current = fillerCacheRef.current[languageRef.current]
        if (count === 0) {
          // One quiet retry; fillers are a nicety, never worth a request storm.
          setTimeout(() => {
            fetchFillers(languageRef.current)
              .then(() => { fillerAudioRef.current = fillerCacheRef.current[languageRef.current] })
              .catch(() => { })
          }, 30000)
        }
      })
      .catch(() => { })
  }, [fetchFillers])

  useEffect(() => {
    const fallback = setTimeout(ensureFillers, 15000)
    return () => clearTimeout(fallback)
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
    generationRef.current++ // invalidate any pending finalize (incl. browser-TTS handlers and captions timers)
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

  const playSmartAudio = useCallback(async (
    text: string,
    onEnd: () => void,
    opts?: { onAutoplayBlocked?: () => void },
  ) => {
    isSpeakingRef.current = true
    setVoiceState('speaking')
    window.speechSynthesis?.cancel()
    clearWatchdog()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // This playback's generation. killAudio() or a newer playSmartAudio()
    // bumping the counter makes every callback of THIS playback a no-op.
    const gen = ++generationRef.current

    // Single-fire finalization: every completion path (natural end, error,
    // watchdog) funnels through here exactly once — and only while this
    // playback is still the live one.
    let done = false
    const finalize = (viaWatchdog = false) => {
      if (done || gen !== generationRef.current) return
      done = true
      clearWatchdog()
      isSpeakingRef.current = false
      if (viaWatchdog) console.warn('[TTS] watchdog fired — audio never signaled completion')
      // First completed speech = safe moment to warm the filler cache.
      ensureFillers()
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
      utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
        // A cancel from killAudio (barge-in) is NOT a failure — counting it
        // toward the streak used to falsely latch captions mode after two
        // interruptions, muting a perfectly working session.
        if (e?.error !== 'canceled' && e?.error !== 'interrupted') {
          ttsFailStreakRef.current++
          if (ttsFailStreakRef.current >= 2) setCaptionsMode(true)
        }
        finalize()
      }
      armWatchdog()
      window.speechSynthesis.speak(utterance)
    }

    try {
      // 1-entry synthesis cache. Sarvam bills per character, so we must never
      // pay to synthesize the SAME text twice in a row. This kills two real
      // wastes: (a) on mobile the opener is fetched once (autoplay-blocked),
      // then replayed on the unlock tap — same text; (b) an empty-capture
      // reprompt re-speaks the last question — same text. Both now reuse the
      // cached audio, same quality, zero extra Sarvam calls.
      let src = lastTtsRef.current && lastTtsRef.current.text === text && lastTtsRef.current.lang === languageRef.current
        ? lastTtsRef.current.src
        : null
      if (!src) {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formId, text, language: languageRef.current }),
          signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
        })
        const data = await res.json()
        if (data.fallback || data.error || !data.audioContent) throw new Error('fallback')
        const mimeType = data.format === 'wav' ? 'audio/wav' : 'audio/mpeg'
        src = `data:${mimeType};base64,${data.audioContent}`
        lastTtsRef.current = { text, lang: languageRef.current, src }
      }

      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current
      // Defensive: the element is reused across turns — never inherit a stale
      // rate (this manifested as the voice suddenly "speaking slow").
      audio.playbackRate = 1
      audio.defaultPlaybackRate = 1
      audio.src = src
      audio.load()
      audio.onended = () => { ttsFailStreakRef.current = 0; finalize() }
      audio.onerror = () => { console.warn('[TTS] playback error, finalizing'); finalize() }
      armWatchdog()
      await audio.play().catch(() => { throw new Error('autoplay blocked') })
    } catch (err: any) {
      // An autoplay block means NO sound can start without a user gesture —
      // browser speech would be just as silently blocked. When the caller gave
      // us an escape hatch (the opener does), hand control back so it can show
      // a tap-to-play affordance instead of a mute "speaking" state.
      if (err?.message === 'autoplay blocked' && opts?.onAutoplayBlocked) {
        done = true
        clearWatchdog()
        isSpeakingRef.current = false
        opts.onAutoplayBlocked()
        return
      }
      speakWithBrowser()
    }
  }, [formId, setVoiceState, captionsMode, clearWatchdog, ensureFillers])

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

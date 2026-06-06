'use client'

import { useRef, useCallback, useEffect } from 'react'

export type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

const HINDI_FILLERS = ["हाँ, एक पल...", "नोट कर रहा हूँ...", "समझ गया...", "ज़रूर, बताइए..."]

export function useTTS(formId: string, setVoiceState: (s: VoiceState) => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fillerAudioRef = useRef<string[]>([])
  const fillerFormatRef = useRef<string>('mpeg')
  const languageRef = useRef<'hi' | 'en'>('hi')
  const isSpeakingRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(HINDI_FILLERS.map(f =>
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formId, text: f, language: 'hi' }),
          }).then(r => r.json())
        ))
        const first = results.find(r => r.audioContent && r.format)
        if (first) fillerFormatRef.current = first.format === 'wav' ? 'wav' : 'mpeg'
        fillerAudioRef.current = results.map(r => r.audioContent).filter(Boolean)
      } catch { }
    }, 2000)
    return () => clearTimeout(timer)
  }, [formId])

  const killAudio = useCallback(() => {
    isSpeakingRef.current = false
    window.speechSynthesis?.cancel()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [])

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
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    const handleEnd = () => {
      isSpeakingRef.current = false
      onEnd()
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, text, language: languageRef.current }),
      })
      const data = await res.json()
      if (data.fallback || data.error || !data.audioContent) throw new Error('fallback')

      const audio = audioRef.current!
      const mimeType = data.format === 'wav' ? 'audio/wav' : 'audio/mpeg'
      audio.src = `data:${mimeType};base64,${data.audioContent}`
      audio.onended = handleEnd
      audio.onerror = () => { console.warn('[TTS] fallback to native'); handleEnd() }
      await audio.play().catch(() => { throw new Error('autoplay blocked') })
    } catch {
      if (!('speechSynthesis' in window)) { isSpeakingRef.current = false; onEnd(); return }
      const utterance = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v => v.lang.includes('en-IN'))
        ?? voices.find(v => v.name.toLowerCase().includes('google'))
        ?? null
      if (preferred) utterance.voice = preferred
      utterance.rate = 1.05
      utterance.onend = handleEnd
      utterance.onerror = () => { isSpeakingRef.current = false; onEnd() }
      window.speechSynthesis.speak(utterance)
    }
  }, [formId, setVoiceState])

  return { audioRef, fillerAudioRef, fillerFormatRef, languageRef, isSpeakingRef, playSmartAudio, killAudio, playChime }
}

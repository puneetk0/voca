'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useConversationStore } from '@/lib/store/conversation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Keyboard, Send, CheckCircle2, Square, WifiOff, ExternalLink } from 'lucide-react'
import { submitResponse } from '@/lib/actions/submit'
import { useVoiceRecorder } from '@/lib/hooks/useVoiceRecorder'
import Waveform from '@/components/voice/Waveform'
import Typewriter, { TypewriterHandle } from '@/components/chat/Typewriter'

type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

const GHOST_MESSAGES = [
  "Taking a moment — bear with me.",
  "Processing that — just a second.",
  "Almost there, one moment.",
]

const CONVERSE_TIMEOUT_MS = 8000

/** Fetch /api/converse with AbortController timeout */
async function fetchConverse(body: object): Promise<{ data?: any; timedOut?: boolean; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONVERSE_TIMEOUT_MS)
  try {
    const res = await fetch('/api/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'API error' }
    return { data }
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') return { timedOut: true }
    return { error: err.message }
  }
}

export default function FormSession({
  form,
  fields,
  prefills = {},
  userEmail,
}: {
  form: any
  fields: any[]
  prefills?: Record<string, string>
  userEmail?: string
}) {
  const store = useConversationStore()
  const [inputText, setInputText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  // audioRef must be created on a direct user gesture to satisfy browser autoplay policy.
  // We create it the moment the user taps "Talk with me" — NOT lazily later.
  // On iOS, an Audio element created outside a user gesture will be blocked silently.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typewriterRef = useRef<TypewriterHandle>(null)

  // Guard refs — prevent VAD race conditions
  // isSpeakingRef: true for entire TTS playback duration, blocks VAD → startRecording race
  // isHandlingTranscriptRef: true while a converse call is in-flight, blocks duplicate fires
  const isSpeakingRef = useRef(false)
  const isHandlingTranscriptRef = useRef(false)

  const playChime = useCallback(() => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtxClass) return
      const ctx = new AudioCtxClass()
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
      setTimeout(() => ctx.state !== 'closed' && ctx.close().catch(() => { }), 500)
    } catch (e) { }
  }, [])

  useEffect(() => {
    store.init(form.id, fields)
    const fieldsByLabel = Object.fromEntries(
      fields.map(f => [f.label.toLowerCase().trim(), f.id])
    )
    Object.entries(prefills).forEach(([key, value]) => {
      const fieldId = fieldsByLabel[key.toLowerCase().trim()]
      if (fieldId) store.setAnswer(fieldId, value)
    })
    return () => {
      window.speechSynthesis.cancel()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  useEffect(() => {
    if (store.mode === 'text' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [store.history, store.isAiTyping, store.mode])

  // --- LATENCY MASKING ---
  // Pre-fetch filler audio clips for latency masking.
  // We keep a local cache of these clips to play instantly when the user stops talking,
  // making the AI active and hiding the latency of Gemini and STT.
  const fillerAudioRef = useRef<string[]>([])
  useEffect(() => {
    const fetchFillers = async () => {
      try {
        const fillers = ["Ek second note karlu....."]
        const results = await Promise.all(fillers.map(f =>
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formId: form.id, text: f }),
          }).then(res => res.json())
        ))
        fillerAudioRef.current = results.map(r => r.audioContent).filter(Boolean)
      } catch (e) { }
    }
    fetchFillers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  // --- TTS ---
  // Plays AI response audio. Uses Google TTS with native SpeechSynthesis fallback.
  // isSpeakingRef is kept true for the entire playback duration to block
  // any VAD from triggering startRecording while the AI is talking.
  const playSmartAudio = useCallback(async (text: string, onEnd: () => void) => {
    isSpeakingRef.current = true
    setVoiceState('speaking')

    // Cancel any currently playing audio
    window.speechSynthesis.cancel()
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
        body: JSON.stringify({ formId: form.id, text }),
      })
      const data = await res.json()
      if (data.fallback || data.error || !data.audioContent) throw new Error('fallback')

      // audioRef.current is guaranteed non-null here because we create it in
      // handleInitialSequence on the user gesture that starts voice mode.
      const audio = audioRef.current!
      audio.src = `data:audio/mp3;base64,${data.audioContent}`
      audio.onended = handleEnd
      audio.onerror = () => {
        console.warn('[TTS] Audio element error, falling back to native')
        handleEnd()
      }
      // play() can throw on autoplay policy violations — catch and fallback
      await audio.play().catch(() => { throw new Error('autoplay blocked') })

    } catch (e) {
      // Native SpeechSynthesis fallback
      if (!('speechSynthesis' in window)) {
        isSpeakingRef.current = false
        onEnd()
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(v => v.lang.includes('en-IN'))
        ?? voices.find(v => v.name.toLowerCase().includes('google'))
        ?? null
      if (preferredVoice) utterance.voice = preferredVoice
      utterance.rate = 1.05
      utterance.onend = handleEnd
      utterance.onerror = () => { isSpeakingRef.current = false; onEnd() }
      window.speechSynthesis.speak(utterance)
    }
  }, [form.id])

  // Optimistic thinking label shown while Gemini processes
  function getThinkingLabel(fieldType: string, transcript: string) {
    if (store.mode === 'voice') return 'Extracting your answer...'
    const short = transcript.slice(0, 40)
    if (fieldType === 'email') return `Extracting your email.`
    if (fieldType === 'number') return `Noting your number.`
    if (fieldType === 'phone') return `Reading phone number.`
    return `Got that — processing "${short}"...`
  }

  // --- CORE CONVERSE HANDLER ---
  const handleConverseResponse = useCallback(async (
    userMessage: string,
    fieldIndex: number,
    mode: 'text' | 'voice',
    onSuccess: (aiMessage: string, isComplete: boolean) => void,
    extraContext?: string,
  ) => {
    store.setIsAiTyping(true)
    store.setConnectionLost(false)
    if (mode === 'voice') setVoiceState(prev => prev === 'speaking' ? 'speaking' : 'thinking')

    const result = await fetchConverse({
      formId: form.id,
      currentFieldIndex: fieldIndex,
      history: store.history,
      userMessage,
      userEmail,
      ...(extraContext ? { extraContext } : {}),
    })

    if (result.timedOut) {
      const ghost = GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)]
      store.addMessage({ id: Date.now().toString(), role: 'ai', text: ghost })
      store.setIsAiTyping(false)

      // Silent retry
      const retry = await fetchConverse({
        formId: form.id,
        currentFieldIndex: fieldIndex,
        history: store.history,
        userMessage,
        userEmail,
      })

      if (retry.data) {
        result.data = retry.data
      } else {
        store.setConnectionLost(true)
        store.setIsAiTyping(false)
        if (mode === 'voice') {
          setVoiceState('error')
          isSpeakingRef.current = false
        }
        return
      }
    }

    if (result.error || !result.data) {
      store.setConnectionLost(true)
      store.setIsAiTyping(false)
      if (mode === 'voice') {
        setVoiceState('error')
        isSpeakingRef.current = false
      }
      return
    }

    const data = result.data
    store.setConnectionLost(false)

    if (data.extractedValue) store.setAnswer(fields[fieldIndex].id, data.extractedValue)
    if (data.nextFieldIndex !== undefined) store.setNextField(data.nextFieldIndex)

    if (data.aiMessage) {
      const existingPlaceholder = store.history.some(m => m.id === '__ai_thinking__')
      const newMsg = {
        id: Date.now().toString(),
        role: 'ai' as const,
        text: data.aiMessage,
      }
      if (existingPlaceholder) {
        store.replaceMessage('__ai_thinking__', newMsg)
      } else {
        store.addMessage(newMsg)
      }
    }

    store.setIsAiTyping(false)

    const actuallyComplete = data.isComplete ||
      (data.nextFieldIndex !== undefined && data.nextFieldIndex >= fields.length)

    if (data.aiMessage || data.aiSpokenMessage) {
      onSuccess(data.aiSpokenMessage || data.aiMessage, actuallyComplete)
    } else {
      isSpeakingRef.current = false
    }
  }, [form.id, store, fields, userEmail])

  // --- VOICE TRANSCRIPT HANDLER ---
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError, stream } = useVoiceRecorder(
    async (transcript, audioBlob) => {
      // Guard 1: AI is still speaking — ignore, VAD fired too early
      if (isSpeakingRef.current) return
      // Guard 2: Already processing a transcript — ignore duplicate VAD fires
      if (isHandlingTranscriptRef.current) return
      isHandlingTranscriptRef.current = true

      const cleanTranscript = transcript.trim()

      // Empty capture — replay last question and re-listen
      if (cleanTranscript.length < 2) {
        const lastAiMessage = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text
        const reprompt = lastAiMessage || "Sorry, didn't quite catch that — could you try again?"
        playSmartAudio(reprompt, () => {
          setVoiceState('idle')
          startRecording()
          isHandlingTranscriptRef.current = false
        })
        return
      }

      const fieldIndex = store.currentFieldIndex
      const currentField = fields[fieldIndex]

      if (audioBlob.size > 0) store.setAudioBlob(currentField.id, audioBlob)

      // Optimistic UI: user message + thinking placeholder
      store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Voice] ${cleanTranscript}` })
      store.addMessage({
        id: '__ai_thinking__',
        role: 'ai',
        text: getThinkingLabel(currentField?.field_type || 'text', cleanTranscript),
      })

      // LATENCY MASKING: Instantly play a random filler right when processing starts
      if (fillerAudioRef.current.length > 0 && audioRef.current) {
        const base64 = fillerAudioRef.current[Math.floor(Math.random() * fillerAudioRef.current.length)]
        audioRef.current.onended = null // CRITICAL: Clear old playback handlers!
        isSpeakingRef.current = true    // CRITICAL: Lock VAD while filler plays
        audioRef.current.src = `data:audio/mp3;base64,${base64}`
        audioRef.current.play().catch(() => { })
        setVoiceState('speaking') // turns the orb instantly yellow/active
      } else {
        setVoiceState('thinking')
      }

      // Fire converse — no filler words, visual thinking state handles the wait
      await handleConverseResponse(cleanTranscript, fieldIndex, 'voice', (aiMessage, isComplete) => {
        playSmartAudio(aiMessage, () => {
          isHandlingTranscriptRef.current = false
          setVoiceState('idle')
          if (!isComplete) startRecording()
          else store.setMode('review')
        })
      })

      // If handleConverseResponse errored without calling onSuccess, unlock the guard
      if (isHandlingTranscriptRef.current && voiceState === 'error') {
        isHandlingTranscriptRef.current = false
      }
    },
    form.id,
  )

  useEffect(() => {
    if (isRecording) setVoiceState('listening')
    if (isProcessing) setVoiceState('transcribing')
    if (recorderError) setVoiceState('error')
  }, [isRecording, isProcessing, recorderError])

  // Start sequence based on explicit user gesture (onClick)
  async function handleInitialSequence(mode: 'text' | 'voice') {
    if (mode === 'voice') {
      try {
        // Step 1: Request mic permission
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        tempStream.getTracks().forEach(t => t.stop())
      } catch (err) {
        // Mic blocked — fall back to text
        store.setMode('text')
        handleInitialSequence('text')
        return
      }
      setVoiceState('thinking')
    }

    const prefillEntries = Object.entries(prefills)
    const prefillNote = prefillEntries.length > 0
      ? `Note: You already know the following about this user from the URL: ${prefillEntries.map(([k, v]) => `${k}=${v}`).join(', ')}. Acknowledge this naturally and ask for the first MISSING field.`
      : ''

    store.addMessage({ id: '__ai_thinking__', role: 'ai', text: 'Setting things up...' })

    await handleConverseResponse('Hello', 0, mode, (aiMessage) => {
      if (mode === 'voice') {
        playSmartAudio(aiMessage, () => { setVoiceState('idle'); startRecording() })
      }
    }, prefillNote)
  }

  // --- TEXT HANDLER ---
  async function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || store.isAiTyping) return
    const userMsg = inputText.trim()
    setInputText('')
    store.addMessage({ id: Date.now().toString(), role: 'user', text: userMsg })
    store.addMessage({
      id: '__ai_thinking__',
      role: 'ai',
      text: getThinkingLabel(fields[store.currentFieldIndex]?.field_type || 'text', userMsg)
    })
    const fieldIndex = store.currentFieldIndex
    await handleConverseResponse(userMsg, fieldIndex, 'text', (_, isComplete) => {
      if (isComplete) setTimeout(() => store.setMode('review'), 2000)
    })
  }

  async function handleSubmitForm() {
    setSubmitting(true)
    try {
      const inputMethod = store.history.some(h => h.role === 'user' && h.text.includes('[Voice]'))
        ? 'voice' : 'text'

      const formData = new FormData()
      formData.append('formId', form.id)
      formData.append('inputMethod', inputMethod)
      formData.append('answers', JSON.stringify(store.answers))
      formData.append('history', JSON.stringify(store.history))

      Object.entries(store.audioBlobs).forEach(([fieldId, audioBlob]) => {
        formData.append(`audio_${fieldId}`, audioBlob as Blob, `${fieldId}.webm`)
      })

      await submitResponse(formData)
      playChime()
      store.setMode('success')
    } catch (e) {
      console.error(e)
      alert('Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  // --- THINKING DOTS ANIMATION ---
  // Replaces the filler words. Shows while voiceState is 'thinking' or 'transcribing'.
  // Three dots that animate sequentially — universally understood as "processing".
  const ThinkingDots = () => (
    <div className="flex items-center gap-1.5 h-8">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/30"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{
            repeat: Infinity,
            duration: 1.2,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )

  // --- CONNECTION LOST TOAST ---
  const ConnectionLostToast = () => (
    <AnimatePresence>
      {store.connectionLost && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-5 py-3 rounded-full flex items-center gap-3 shadow-xl text-sm font-medium z-50"
        >
          <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
          AI is taking a nap. Retrying or switch to text mode.
          <button
            onClick={() => { store.setConnectionLost(false); store.setMode('text') }}
            className="ml-1 text-accent-amber underline"
          >
            Switch
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ==================== RENDERS ====================

  if (store.mode === 'choice') {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
        <ConnectionLostToast />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full text-center space-y-12">
          <div>
            <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight mb-4">{form.title}</h1>
            <p className="text-xl text-foreground/60 max-w-lg mx-auto">{form.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <button
              onClick={() => {
                // Step 2: Create Audio element NOW, synchronously on this user gesture.
                // This is the critical fix for iOS autoplay policy.
                if (!audioRef.current) {
                  audioRef.current = new Audio()
                  audioRef.current.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
                  audioRef.current.play().catch(() => { })
                  audioRef.current.src = ''
                }
                store.setMode('voice')
                handleInitialSequence('voice')
              }}
              className="group flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-accent-amber/10 text-accent-amber hover:bg-accent-amber/20 border border-accent-amber/20 transition-all font-medium h-[200px]"
            >
              <Mic className="h-10 w-10 group-hover:scale-110 transition-transform" />
              <span className="text-lg">Talk with me</span>
            </button>
            <button
              onClick={() => {
                store.setMode('text')
                handleInitialSequence('text')
              }}
              className="group flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-foreground/[0.03] text-foreground hover:bg-foreground/[0.05] border border-foreground/10 transition-all font-medium h-[200px]"
            >
              <Keyboard className="h-10 w-10 group-hover:scale-110 transition-transform text-foreground/50" />
              <span className="text-lg">I'll Type</span>
            </button>
          </div>
        </motion.div>
      </main>
    )
  }

  if (store.mode === 'voice') {
    const lastAiText = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text ?? ''
    const isThinking = voiceState === 'thinking' || voiceState === 'transcribing'

    const orbColour = voiceState === 'speaking'
      ? 'bg-accent-amber shadow-[0_0_60px_rgba(245,158,11,0.25)]'
      : voiceState === 'listening'
        ? 'bg-accent-sage shadow-[0_0_60px_rgba(132,204,22,0.25)]'
        : voiceState === 'error'
          ? 'bg-red-500/80'
          : 'bg-foreground/15'

    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-between p-6 pt-safe pb-safe bg-background overflow-hidden">
        <ConnectionLostToast />

        {/* Ambient background glow */}
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 transition-colors duration-1000 ${voiceState === 'speaking' ? 'bg-accent-amber/8'
          : voiceState === 'listening' ? 'bg-accent-sage/8'
            : 'bg-transparent'
          }`} />

        <div />

        <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="flex flex-col items-center gap-10 w-full max-w-sm mx-auto">

          {/* Current question text OR thinking dots */}
          <div className="min-h-[80px] flex items-center justify-center w-full">
            <AnimatePresence mode="wait">
              {isThinking ? (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ThinkingDots />
                </motion.div>
              ) : lastAiText ? (
                <motion.p
                  key={lastAiText}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="font-serif text-2xl sm:text-3xl text-center leading-snug text-foreground px-2"
                >
                  {lastAiText.replace('[Voice]', '')}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Orb */}
          <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-accent-sage/30"
                animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              />
            )}

            <motion.button
              onClick={() => { if (voiceState === 'listening') stopRecording() }}
              className={`relative z-10 w-[140px] h-[140px] rounded-full flex flex-col items-center justify-center transition-colors duration-500 ${orbColour}`}
              animate={isThinking
                ? { scale: [0.97, 1, 0.97], opacity: [0.6, 1, 0.6] }
                : { scale: 1, opacity: 1 }
              }
              transition={{ repeat: isThinking ? Infinity : 0, duration: 1.4 }}
            >
              {voiceState === 'listening' && (
                <>
                  <Waveform stream={stream} isActive={isRecording} color="#000" />
                  <Square className="h-5 w-5 text-black fill-black mt-2 opacity-70" />
                </>
              )}
              {voiceState === 'error' && <WifiOff className="h-8 w-8 text-white" />}
            </motion.button>
          </div>

        </motion.div>

        <button
          onClick={() => {
            isSpeakingRef.current = false
            window.speechSynthesis.cancel()
            if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
            stopRecording()
            store.setMode('text')
          }}
          className="text-sm text-foreground/30 hover:text-foreground/60 transition-colors py-2"
        >
          Switch to keyboard
        </button>
      </main>
    )
  }

  if (store.mode === 'text') {
    return (
      <main className="min-h-[100dvh] flex flex-col bg-background max-w-3xl mx-auto w-full relative">
        <ConnectionLostToast />
        <header className="p-4 sm:p-6 pb-2 border-b border-foreground/5 bg-background/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
          <h2 className="font-serif font-medium text-foreground tracking-tight truncate pr-4">{form.title}</h2>
          <button onClick={() => store.setMode('review')} className="text-xs text-foreground/40 hover:text-foreground">Skip to review</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <AnimatePresence>
            {store.history.map((msg, idx) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-3xl ${msg.role === 'user'
                  ? 'bg-foreground/[0.05] text-foreground rounded-tr-sm'
                  : 'bg-transparent text-foreground font-serif text-xl sm:text-2xl leading-relaxed py-4'
                  }`}>
                  {msg.role === 'ai' && idx === store.history.length - 1 && !store.isAiTyping ? (
                    <Typewriter ref={typewriterRef} text={msg.text.replace('[Voice]', '')} speed={35} />
                  ) : (
                    msg.text.replace('[Voice]', '')
                  )}
                </div>
              </motion.div>
            ))}
            {store.isAiTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start p-4 py-4">
                <ThinkingDots />
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 pb-8 bg-gradient-to-t from-background via-background to-transparent">
          <form onSubmit={handleSendText} className="relative flex items-center">
            <input
              type="text"
              autoFocus
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => typewriterRef.current?.finish()}
              disabled={store.isAiTyping}
              placeholder="Type your response..."
              className="w-full bg-foreground/[0.03] border border-foreground/10 text-foreground rounded-full pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-accent-amber/50 placeholder:text-foreground/30 disabled:opacity-50 transition-all font-sans"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || store.isAiTyping}
              className="absolute right-2 p-2 bg-foreground text-background rounded-full hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 transition-all"
            >
              <Send className="h-5 w-5 ml-0.5" />
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (store.mode === 'review') {
    return (
      <main className="max-w-2xl mx-auto py-12 px-6 min-h-[100dvh] flex flex-col">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          <header className="mb-10">
            <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">Review your answers</h1>
            <p className="text-foreground/60">We've extracted this from our conversation. Feel free to edit before submitting.</p>
          </header>
          <div className="space-y-6 flex-1 pr-1 pb-10">
            {fields.map((field) => (
              <div key={field.id} className="bg-foreground/[0.02] border border-foreground/5 p-5 border-l-4 border-l-accent-sage rounded-r-2xl">
                <label className="block text-sm font-medium text-foreground/70 mb-2">{field.label}</label>
                {field.field_type === 'textarea' ? (
                  <textarea
                    value={store.answers[field.id] || ''}
                    onChange={(e) => store.setAnswer(field.id, e.target.value)}
                    className="w-full bg-transparent border-b border-foreground/10 focus:border-foreground pb-1 focus:outline-none resize-none font-medium"
                    rows={3}
                  />
                ) : (
                  <input
                    value={store.answers[field.id] || ''}
                    onChange={(e) => store.setAnswer(field.id, e.target.value)}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : 'text'}
                    className="w-full bg-transparent border-b border-foreground/10 focus:border-foreground pb-1 focus:outline-none font-medium"
                  />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        <div className="pt-6 pb-6 sticky bottom-0 bg-background/90 backdrop-blur-md shadow-[0_-20px_30px_rgba(0,0,0,0.05)]">
          <button
            onClick={handleSubmitForm}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-semibold text-background hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
          >
            {submitting ? 'Submitting securely...' : <><CheckCircle2 className="h-5 w-5" /> Submit Form</>}
          </button>
        </div>
      </main>
    )
  }

  if (store.mode === 'success') {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-md">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-sage/10 mb-6 text-accent-sage">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="text-3xl font-serif tracking-tight mb-4">All done!</h2>
          <p className="text-foreground/70">Your answers have been securely submitted to the creator of "{form.title}".</p>

          <div className="mt-10 p-6 rounded-2xl bg-accent-amber/10 border border-accent-amber/20 text-left">
            <p className="text-sm font-medium text-foreground/60 uppercase tracking-wider mb-2">Forms are dead.</p>
            <p className="text-lg font-serif font-medium text-foreground mb-4">
              Build your own conversational AI form — free forever.
            </p>
            <a
              href="/?ref=form_completion"
              className="inline-flex items-center gap-2 bg-accent-amber text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Create Yours <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <p className="mt-6 text-xs text-foreground/30 font-medium tracking-wide uppercase">Powered by Voca</p>
        </motion.div>
      </main>
    )
  }

  return null
}
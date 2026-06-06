'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useConversationStore } from '@/lib/store/conversation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Keyboard, Send, Square, WifiOff, CheckCircle2 } from 'lucide-react'
import { submitResponse } from '@/lib/actions/submit'
import { useVoiceRecorder } from '@/lib/hooks/useVoiceRecorder'
import { useTTS, type VoiceState } from '@/lib/hooks/useTTS'
import Typewriter, { TypewriterHandle } from '@/components/chat/Typewriter'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import ReviewScreen from './ReviewScreen'
import SuccessScreen from './SuccessScreen'

const GHOST_MESSAGES = [
  "Taking a moment — bear with me.",
  "Processing that — just a second.",
  "Almost there, one moment.",
]

const CONVERSE_TIMEOUT_MS = 6000

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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  // Ref that mirrors voiceState — allows reading current value inside async closures
  // without stale-closure bugs (React state is always the captured render value)
  const voiceStateRef = useRef<VoiceState>('idle')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typewriterRef = useRef<TypewriterHandle>(null)

  // Tracks the most recently confirmed answer to show between questions
  const [lastConfirmedAnswer, setLastConfirmedAnswer] = useState<{ label: string; value: string } | null>(null)
  const lastConfirmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper: show a confirmed answer pill for 3s then fade
  const showConfirmedPill = useCallback((label: string, value: string) => {
    setLastConfirmedAnswer({ label, value })
    if (lastConfirmedTimerRef.current) clearTimeout(lastConfirmedTimerRef.current)
    lastConfirmedTimerRef.current = setTimeout(() => setLastConfirmedAnswer(null), 4000)
  }, [])

  // isHandlingTranscriptRef: true while a converse call is in-flight, blocks duplicate VAD fires
  const isHandlingTranscriptRef = useRef(false)

  const { audioRef, fillerAudioRef, fillerFormatRef, languageRef, isSpeakingRef, playSmartAudio, killAudio, playChime } = useTTS(form.id, setVoiceState)


  const ANSWERS_KEY = `voca_answers_${form.id}`

  useEffect(() => {
    store.init(form.id, fields)
    const fieldsByLabel = Object.fromEntries(
      fields.map(f => [f.label.toLowerCase().trim(), f.id])
    )
    Object.entries(prefills).forEach(([key, value]) => {
      const fieldId = fieldsByLabel[key.toLowerCase().trim()]
      if (fieldId) store.setAnswer(fieldId, value)
    })
    // Restore in-progress answers from localStorage
    try {
      const saved = localStorage.getItem(ANSWERS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, string>
        Object.entries(parsed).forEach(([id, val]) => store.setAnswer(id, val))
      }
    } catch { }
    return () => {
      window.speechSynthesis.cancel()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  // Persist answers to localStorage on every change
  useEffect(() => {
    if (Object.keys(store.answers).length === 0) return
    try { localStorage.setItem(ANSWERS_KEY, JSON.stringify(store.answers)) } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.answers])

  // Keep voiceStateRef in sync so async callbacks always read the current value
  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  // Epic 5: Track form abandonment for PostHog
  useEffect(() => {
    return () => {
      if (store.mode !== 'success') {
        try {
          if (typeof window !== 'undefined' && (window as any).posthog) {
            (window as any).posthog.capture('form_abandoned', {
              form_id: form.id,
              completed_fields: Object.keys(store.answers).length,
              total_fields: fields.length,
            })
          }
        } catch (e) { /* analytics must never crash the app */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace the custom ConnectionLostToast component with sonner.
  // Watch connectionLost flag and fire a toast — no inline JSX needed.
  useEffect(() => {
    if (store.connectionLost) {
      toast.error('AI is taking a nap.', {
        description: 'Retrying... or switch to text mode.',
        duration: 6000,
        action: {
          label: 'Switch to text',
          onClick: () => { store.setConnectionLost(false); store.setMode('text') },
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.connectionLost])

  useEffect(() => {
    if (store.mode === 'text' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [store.history, store.isAiTyping, store.mode])

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
    confidence?: number,
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
      currentLanguage: languageRef.current,
      ...(extraContext ? { extraContext } : {}),
      confidence,
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
        currentLanguage: languageRef.current,
        confidence,
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

    // Language switch: if AI signals English, lock in for the rest of the session
    // and clear Hindi fillers so we don't play Hindi audio before an English response
    if (data.language === 'en' && languageRef.current === 'hi') {
      languageRef.current = 'en'
      fillerAudioRef.current = []
    }

    if (data.extractedValues && typeof data.extractedValues === 'object') {
      Object.entries(data.extractedValues).forEach(([fieldId, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          store.setAnswer(fieldId, value as string)
          // Show the confirmed pill between questions
          const matchedField = fields.find(f => f.id === fieldId)
          if (matchedField) showConfirmedPill(matchedField.label, value as string)
        }
      })
    } else if (data.extractedValue) {
      store.setAnswer(fields[fieldIndex].id, data.extractedValue)
      showConfirmedPill(fields[fieldIndex].label, data.extractedValue)
    }
    
    if (data.sentiment) {
      store.setSentiment(fields[fieldIndex].id, data.sentiment)
    }
    
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
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError, stream, vadVolume } = useVoiceRecorder(
    async (transcript, audioBlob, confidence) => {
      // Guard 1: AI is still speaking — ignore, VAD fired too early
      if (isSpeakingRef.current) return
      // Guard 2: Already processing a transcript — ignore duplicate VAD fires
      if (isHandlingTranscriptRef.current) return
      isHandlingTranscriptRef.current = true

      const cleanTranscript = transcript.trim()

      // Empty capture — replay last question and re-listen
      if (cleanTranscript.length < 2) {
        const capturedFieldIndex = store.currentFieldIndex
        const lastAiMessage = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text
        const reprompt = lastAiMessage || "Sorry, didn't quite catch that — could you try again?"
        playSmartAudio(reprompt, () => {
          setVoiceState('idle')
          // P0 fix: respect field type — don't start mic for file upload fields
          if (shouldAutoListen(capturedFieldIndex)) startRecording()
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
        audioRef.current.src = `data:audio/${fillerFormatRef.current};base64,${base64}`
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
      }, undefined, confidence)

      // P0 fix: use voiceStateRef (not voiceState) to read the CURRENT state value,
      // not the stale closure value captured when this callback was created.
      if (isHandlingTranscriptRef.current && voiceStateRef.current === 'error') {
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

  // After AI speaks and field is 'file', don't start the mic — user must tap upload
  function shouldAutoListen(fieldIndex: number) {
    return fields[fieldIndex]?.field_type !== 'file'
  }

  async function handleInitialSequence(mode: 'text' | 'voice') {
    if (mode === 'voice') {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        tempStream.getTracks().forEach(t => t.stop())
      } catch (err) {
        // Epic 3: mic denied or not available — graceful degradation with toast
        toast.error("We couldn't detect your microphone.", {
          description: 'Switching to text mode instead.',
          duration: 4000,
        })
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
        playSmartAudio(aiMessage, () => {
          setVoiceState('idle')
          if (shouldAutoListen(store.currentFieldIndex)) startRecording()
        })
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
    setSubmitError(null)
    try {
      const inputMethod = store.history.some(h => h.role === 'user' && h.text.includes('[Voice]'))
        ? 'voice' : 'text'

      const formData = new FormData()
      formData.append('formId', form.id)
      formData.append('inputMethod', inputMethod)
      formData.append('answers', JSON.stringify(store.answers))
      formData.append('sentiments', JSON.stringify(store.sentiments))
      formData.append('history', JSON.stringify(store.history))

      Object.entries(store.audioBlobs).forEach(([fieldId, audioBlob]) => {
        formData.append(`audio_${fieldId}`, audioBlob as Blob, `${fieldId}.webm`)
      })

      await submitResponse(formData)
      try { localStorage.removeItem(ANSWERS_KEY) } catch { }
      playChime()
      store.setMode('success')
    } catch (e: any) {
      console.error(e)
      setSubmitError(e?.message || 'Something went wrong. Please try again.')
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

  // ConnectionLostToast replaced by sonner useEffect above — no inline component needed

  // ==================== RENDERS ====================

  if (store.mode === 'choice') {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full text-center space-y-12">
          <div>
            <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight mb-4">{form.title}</h1>
            <p className="text-xl text-foreground/60 max-w-lg mx-auto">{form.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <button
              aria-label="Start voice mode"
              onClick={() => {
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
              aria-label="Start text mode"
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
    const totalFields = fields.length
    const currentQuestionNum = Math.min(store.currentFieldIndex + 1, totalFields)

    const orbColour = voiceState === 'speaking'
      ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_80px_rgba(251,191,36,0.35)]'
      : voiceState === 'listening'
        ? 'bg-gradient-to-br from-lime-400 to-emerald-500 shadow-[0_0_80px_rgba(163,230,53,0.35)]'
        : voiceState === 'error'
          ? 'bg-red-500/80'
          : 'bg-foreground/10 border border-foreground/10'

    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-between p-6 pt-safe pb-safe bg-background overflow-hidden" role="main" aria-label={`Voice form: ${form.title}`}>
        {/* Progress indicator */}
        <div className="w-full max-w-sm pt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-foreground/40 font-medium">Question {currentQuestionNum} of {totalFields}</span>
            <span className="text-xs text-foreground/30">{Math.round((currentQuestionNum / totalFields) * 100)}%</span>
          </div>
          <div className="h-1 w-full bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-amber rounded-full transition-all duration-700"
              style={{ width: `${(currentQuestionNum / totalFields) * 100}%` }}
            />
          </div>
        </div>

        {/* Ambient background glow — brighter, two-tone */}
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] -z-10 transition-all duration-1000 pointer-events-none ${
          voiceState === 'speaking' ? 'bg-amber-400/12'
          : voiceState === 'listening' ? 'bg-lime-400/12'
          : 'opacity-0'
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
          <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
            {/* Outer pulse ring — only when listening */}
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-lime-400/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
            )}
            {/* Second inner ring — listening */}
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-4 rounded-full bg-lime-400/10"
                animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: 'easeInOut' }}
              />
            )}
            {/* Speaking pulse ring */}
            {voiceState === 'speaking' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-amber-400/20"
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              />
            )}

            <motion.button
              aria-label={voiceState === 'listening' ? 'Stop recording' : voiceState === 'error' ? 'Tap to retry recording' : 'Voice input orb'}
              onClick={() => {
                if (voiceState === 'listening') stopRecording()
                if (voiceState === 'error') {
                  isHandlingTranscriptRef.current = false
                  setVoiceState('idle')
                  startRecording()
                }
              }}
              className={`relative z-10 w-[160px] h-[160px] rounded-full flex flex-col items-center justify-center transition-all duration-500 ${orbColour}`}
              animate={isThinking
                ? { scale: [0.96, 1, 0.96], opacity: [0.5, 1, 0.5] }
                : { scale: 1, opacity: 1 }
              }
              transition={{ repeat: isThinking ? Infinity : 0, duration: 1.4 }}
            >
              {/* VAD waveform bars — only render when speech detected above noise floor */}
              {voiceState === 'listening' && (
                <div className="flex items-end gap-[3px] h-8">
                  {[0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.4].map((multiplier, i) => {
                    const barH = Math.max(4, Math.round(vadVolume * 28 * multiplier))
                    return (
                      <motion.span
                        key={i}
                        className="w-[3px] rounded-full bg-black/70"
                        animate={{ height: barH }}
                        transition={{ duration: 0.07, ease: 'linear' }}
                        style={{ minHeight: 4, maxHeight: 28 }}
                      />
                    )
                  })}
                </div>
              )}
              {voiceState === 'listening' && (
                <Square className="h-4 w-4 text-black/60 fill-black/60 mt-2" />
              )}
              {voiceState === 'error' && (
                <div className="flex flex-col items-center gap-1">
                  <WifiOff className="h-7 w-7 text-white" />
                  <span className="text-white text-xs font-medium">Tap retry</span>
                </div>
              )}
            </motion.button>
          </div>

          {/* Confirmed answer pill — shown for 4s after answer is captured */}
          <AnimatePresence>
            {lastConfirmedAnswer && (
              <motion.div
                key={lastConfirmedAnswer.value}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/[0.06] border border-foreground/[0.10]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-sage shrink-0" />
                <span className="text-xs text-foreground/50 font-sans">{lastConfirmedAnswer.label}:</span>
                <span className="text-xs text-foreground font-mono font-medium">{lastConfirmedAnswer.value}</span>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>

        {fields[store.currentFieldIndex]?.field_type === 'mcq' && fields[store.currentFieldIndex]?.options?.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex justify-center flex-wrap gap-2 px-4"
          >
            {fields[store.currentFieldIndex].options.map((opt: string) => (
              <button
                key={opt}
                onClick={async () => {
                  // Prevent double-fire if already handling
                  if (isHandlingTranscriptRef.current) return
                  isHandlingTranscriptRef.current = true

                  // Synchronously kill all audio before any async work
                  killAudio()
                  stopRecording()
                  
                  store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Selected: ${opt}]` })
                  
                  await handleConverseResponse(`[User tapped: ${opt}]`, store.currentFieldIndex, 'voice', (aiMessage, isComplete) => {
                    playSmartAudio(aiMessage, () => {
                      isHandlingTranscriptRef.current = false
                      setVoiceState('idle')
                      const nextIdx = store.currentFieldIndex
                      if (!isComplete) {
                        if (shouldAutoListen(nextIdx)) startRecording()
                      } else {
                        store.setMode('review')
                      }
                    })
                  })
                }}
                className="px-6 py-3 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] active:scale-95 border border-foreground/10 text-foreground font-medium transition-all text-sm"
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}

        {fields[store.currentFieldIndex]?.field_type === 'file' && (
          <div className="w-full max-w-xs mx-auto mt-2 mb-4 px-4 relative z-20">
            <label className={`w-full flex flex-col justify-center items-center gap-2 px-4 py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
              isUploading
                ? 'opacity-50 pointer-events-none border-foreground/20'
                : 'border-accent-amber/40 hover:bg-accent-amber/5 hover:border-accent-amber/60'
            }`}>
              <span className="text-2xl">{isUploading ? '⏳' : '📎'}</span>
              <span className="text-foreground/60 font-medium text-sm text-center">
                {isUploading ? 'Uploading...' : 'Tap to upload file'}
              </span>
              <span className="text-foreground/30 text-xs">Max 5 MB</span>
              <input
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return

                  // 5 MB guard
                  if (file.size > 5 * 1024 * 1024) {
                    store.addMessage({ id: Date.now().toString(), role: 'ai', text: 'File is too large. Please upload something under 5 MB.' })
                    e.target.value = ''
                    return
                  }

                  // Synchronously kill audio + mic
                  killAudio()
                  stopRecording()
                  setIsUploading(true)
                  setVoiceState('thinking')

                  const supabase = createClient()
                  const ext = file.name.split('.').pop() || 'bin'
                  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)
                  const fileName = `${Date.now()}-${safeBase}`

                  const { error } = await supabase.storage
                    .from('user_files')
                    .upload(fileName, file, { contentType: file.type, upsert: false })

                  setIsUploading(false)

                  if (error) {
                    store.addMessage({ id: Date.now().toString(), role: 'ai', text: `Upload failed: ${error.message}` })
                    setVoiceState('idle')
                    // Don't restart mic for file fields — user needs to upload
                    return
                  }

                  const { data: publicData } = supabase.storage.from('user_files').getPublicUrl(fileName)
                  const publicUrl = publicData.publicUrl

                  store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Uploaded: ${file.name}]` })
                  // Store the raw URL directly so review screen can show it
                  store.setAnswer(fields[store.currentFieldIndex].id, publicUrl)

                  const nextIdx = store.currentFieldIndex
                  await handleConverseResponse(
                    `[System: User uploaded file. Name: ${file.name}, URL: ${publicUrl}]`,
                    nextIdx,
                    'voice',
                    (aiMessage, isComplete) => {
                      playSmartAudio(aiMessage, () => {
                        isHandlingTranscriptRef.current = false
                        setVoiceState('idle')
                        const newIdx = store.currentFieldIndex
                        if (!isComplete) {
                          // Only start mic if next field is NOT a file field
                          if (shouldAutoListen(newIdx)) startRecording()
                        } else {
                          store.setMode('review')
                        }
                      })
                    }
                  )
                }}
              />
            </label>
          </div>
        )}

        <div className="w-full max-w-xs mx-auto pb-4 pt-6 z-20">
          <input
            type="text"
            aria-label="Switch to text input"
            placeholder="Tap to type instead..."
            onFocus={() => {
              isSpeakingRef.current = false
              window.speechSynthesis.cancel()
              if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
              stopRecording()
              setVoiceState('idle')
              store.setMode('text')
            }}
            className="w-full bg-foreground/[0.04] border border-foreground/10 text-foreground rounded-full px-6 py-4 focus:outline-none focus:ring-2 focus:ring-accent-amber/50 placeholder:text-foreground/40 transition-all font-sans text-center text-sm shadow-sm hover:bg-foreground/[0.06]"
          />
          {/* Epic 5: Report Issue link — intentionally ironic, per PRD */}
          <div className="text-center mt-4">
            <a
              href="https://tally.so/r/YOUR_TALLY_FORM_ID"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground/20 hover:text-foreground/40 transition-colors"
            >
              Report an issue
            </a>
          </div>
        </div>
      </main>
    )
  }

  if (store.mode === 'text') {
    // Fade curve: only last 2 AI messages at full opacity, older ones muted
    const aiMessageIds = store.history.filter(m => m.role === 'ai').map(m => m.id)
    const recentAiIds = new Set(aiMessageIds.slice(-2))

    return (
      <main className="min-h-[100dvh] flex flex-col bg-background max-w-3xl mx-auto w-full relative" role="main" aria-label={`Text form: ${form.title}`}>
        <header className="p-4 sm:p-6 pb-3 border-b border-foreground/[0.06] bg-background/90 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
          <h2 className="font-serif font-medium text-foreground tracking-tight truncate pr-4">{form.title}</h2>
          <div className="flex items-center gap-3">
            {/* Back to voice — symmetric with voice mode's "tap to type" */}
            <button
              onClick={() => {
                store.setMode('voice')
                setInputText('')
              }}
              className="text-xs text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1"
            >
              <Mic className="h-3 w-3" /> Voice
            </button>
            <button onClick={() => store.setMode('review')} className="text-xs text-foreground/40 hover:text-foreground transition-colors">Review</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <AnimatePresence initial={false}>
            {store.history.map((msg, idx) => {
              const isLastAi = msg.role === 'ai' && !recentAiIds.has(msg.id)
              const isCurrentAi = msg.role === 'ai' && aiMessageIds[aiMessageIds.length - 1] === msg.id
              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: isLastAi ? 0.35 : 1,
                    y: 0,
                  }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[75%] ${
                    msg.role === 'user'
                      ? 'bg-foreground/[0.06] border border-foreground/[0.08] text-foreground rounded-3xl rounded-tr-md px-5 py-3 text-sm font-sans'
                      : 'bg-transparent text-foreground py-3'
                  }`}>
                    {msg.role === 'ai' && isCurrentAi && !store.isAiTyping ? (
                      <Typewriter ref={typewriterRef} text={msg.text.replace('[Voice]', '')} speed={30}
                        className="ai-text text-xl sm:text-2xl leading-snug"
                      />
                    ) : msg.role === 'ai' ? (
                      <p className="ai-text text-xl sm:text-2xl leading-snug">{msg.text.replace('[Voice]', '')}</p>
                    ) : (
                      <span>{msg.text.replace('[Voice] ', '').replace('[Selected: ', '').replace(']', '')}</span>
                    )}
                  </div>
                </motion.div>
              )
            })}
            {store.isAiTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start py-2">
                <ThinkingDots />
              </motion.div>
            )}
          </AnimatePresence>
          {/* Confirmed answer pill — same as voice mode */}
          <AnimatePresence>
            {lastConfirmedAnswer && (
              <motion.div
                key={lastConfirmedAnswer.value}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-end"
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-sage/10 border border-accent-sage/20">
                  <CheckCircle2 className="h-3 w-3 text-accent-sage" />
                  <span className="text-xs text-foreground/50 font-sans">{lastConfirmedAnswer.label}:</span>
                  <span className="text-xs text-foreground font-mono">{lastConfirmedAnswer.value}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 pb-8 bg-gradient-to-t from-background via-background to-transparent">
          {/* P0 fix: MCQ chips in text mode — show tap targets when current field is MCQ */}
          {(() => {
            const cf = fields[store.currentFieldIndex]
            if (cf?.field_type === 'mcq' && cf.options?.length > 0) {
              return (
                <div className="flex flex-wrap gap-2 mb-3">
                  {cf.options.map((opt: string) => (
                    <button
                      key={opt}
                      disabled={store.isAiTyping}
                      onClick={() => {
                        if (store.isAiTyping) return
                        const userMsg = opt
                        store.addMessage({ id: Date.now().toString(), role: 'user', text: userMsg })
                        store.addMessage({ id: '__ai_thinking__', role: 'ai', text: 'Got it...' })
                        const fieldIndex = store.currentFieldIndex
                        handleConverseResponse(userMsg, fieldIndex, 'text', (_, isComplete) => {
                          if (isComplete) setTimeout(() => store.setMode('review'), 2000)
                        })
                      }}
                      className="px-5 py-2 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] active:scale-95 border border-foreground/10 text-foreground font-medium transition-all text-sm disabled:opacity-40"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )
            }
            return null
          })()}
          <form onSubmit={handleSendText} className="relative flex items-center gap-2">
            <input
              type="text"
              aria-label="Your response"
              autoFocus
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => typewriterRef.current?.finish()}
              disabled={store.isAiTyping}
              placeholder={fields[store.currentFieldIndex]?.field_type === 'mcq' ? 'Or type your choice...' : 'Type your response...'}
              className="flex-1 bg-foreground/[0.04] border border-foreground/[0.08] text-foreground rounded-full pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-accent-amber/40 placeholder:text-foreground/25 disabled:opacity-50 transition-all font-sans text-sm"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!inputText.trim() || store.isAiTyping}
              className="absolute right-12 p-2.5 bg-foreground text-background rounded-full hover:scale-105 disabled:opacity-20 disabled:hover:scale-100 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
            {/* Mic icon — tap to return to voice mode */}
            <button
              type="button"
              aria-label="Switch to voice mode"
              onClick={() => {
                store.setMode('voice')
                setInputText('')
              }}
              className="shrink-0 p-3 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/40 hover:text-foreground/70 hover:border-foreground/20 transition-all"
            >
              <Mic className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (store.mode === 'review') {
    return (
      <ReviewScreen
        form={form}
        fields={fields}
        answers={store.answers}
        onAnswerChange={(id, v) => store.setAnswer(id, v)}
        onSubmit={handleSubmitForm}
        submitting={submitting}
        submitError={submitError}
      />
    )
  }

  if (store.mode === 'success') {
    return (
      <SuccessScreen
        form={form}
        fields={fields}
        answers={store.answers}
      />
    )
  }

  return null
}
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
  "I'm thinking deeply on that... bear with me for a moment.",
  "Processing your response — just a second!",
  "Hmm, let me think about that one carefully...",
]

// Instant filler words spoken the moment the user stops talking — masks API latency
const FILLERS = ["Hmm...", "Okay,", "Got it.", "Let me see...", "Alright,", "Sure."]

const CONVERSE_TIMEOUT_MS = 7000

/** Fetch /api/converse with a 7s AbortController timeout */
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
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typewriterRef = useRef<TypewriterHandle>(null)

  // Guard refs to prevent VAD race conditions:
  // isSpeakingRef: true while TTS audio is playing — prevents VAD-triggered startRecording
  //                from racing with the TTS onEnd startRecording call
  // isHandlingTranscriptRef: true while one transcription response is in-flight —
  //                prevents a second VAD auto-stop from firing a duplicate converse call
  const isSpeakingRef = useRef(false)
  const isHandlingTranscriptRef = useRef(false)

  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContext) return
      const ctx = new AudioContext()
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
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {})
      }, 500)
    } catch (e) {}
  }

  useEffect(() => {
    store.init(form.id, fields)
    // Inject URL prefills into the answer store
    const fieldsByLabel = Object.fromEntries(
      fields.map(f => [f.label.toLowerCase().trim(), f.id])
    )
    Object.entries(prefills).forEach(([key, value]) => {
      const fieldId = fieldsByLabel[key.toLowerCase().trim()]
      if (fieldId) store.setAnswer(fieldId, value)
    })
    return () => window.speechSynthesis.cancel()
  }, [form.id])

  useEffect(() => {
    if (store.mode === 'text' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [store.history, store.isAiTyping, store.mode])

  // --- TTS --- (Premium Google TTS with Native Fallback)
  // isSpeakingRef is set to true for the entire duration of TTS playback.
  // This blocks any VAD-triggered startRecording from firing while the AI is talking.
  const playSmartAudio = useCallback(async (text: string, onEnd: () => void, cancelFirst = true) => {
    isSpeakingRef.current = true
    setVoiceState('speaking')
    
    if (cancelFirst) {
      window.speechSynthesis.cancel()
      if (audioRef) {
        audioRef.pause()
        audioRef.currentTime = 0
      }
    }

    const handleEnd = () => {
      isSpeakingRef.current = false
      onEnd()
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: form.id, text })
      })
      const data = await res.json()

      if (data.fallback || data.error) throw new Error('Use native browser TTS')

      const audioToPlay = audioRef || new Audio()
      audioToPlay.src = `data:audio/mp3;base64,${data.audioContent}`
      audioToPlay.onended = handleEnd
      audioToPlay.onerror = handleEnd
      setAudioRef(audioToPlay)
      await audioToPlay.play()

    } catch (e) {
      // Native Browser Fallback
      if (!('speechSynthesis' in window)) { isSpeakingRef.current = false; onEnd(); return }
      const utterance = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(v => v.lang.includes('en-IN') || v.name.includes('Google'))
      if (preferredVoice) utterance.voice = preferredVoice
      utterance.rate = 1.05
      utterance.onend = handleEnd
      utterance.onerror = () => { isSpeakingRef.current = false; onEnd() }
      window.speechSynthesis.speak(utterance)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, audioRef])

  // Thinking message labels per field type — shown immediately while Gemini is working
  function getThinkingLabel(fieldType: string, transcript: string) {
    const short = transcript.slice(0, 40)
    if (fieldType === 'email') return `Extracting email from "${short}"...`
    if (fieldType === 'number') return `Noting your number from "${short}"...`
    if (fieldType === 'phone') return `Reading phone number from "${short}"...`
    return `Got it— processing "${short}"...`
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
    if (mode === 'voice') setVoiceState('thinking')

    const result = await fetchConverse({
      formId: form.id,
      currentFieldIndex: fieldIndex,
      history: store.history,
      userMessage,
      userEmail,
      ...(extraContext ? { extraContext } : {}),
    })

    // 5-second ghost fallback
    if (result.timedOut) {
      const ghost = GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)]
      store.addMessage({ id: Date.now().toString(), role: 'ai', text: ghost })
      store.setIsAiTyping(false)

      // Retry once silently after ghost
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
        // Complete failure
        store.setConnectionLost(true)
        store.setIsAiTyping(false)
        if (mode === 'voice') setVoiceState('error')
        return
      }
    }

    if (result.error || !result.data) {
      store.setConnectionLost(true)
      store.setIsAiTyping(false)
      if (mode === 'voice') setVoiceState('error')
      return
    }

    const data = result.data
    store.setConnectionLost(false)

    if (data.extractedValue) store.setAnswer(fields[fieldIndex].id, data.extractedValue)
    if (data.nextFieldIndex !== undefined) store.setNextField(data.nextFieldIndex)

    // Replace the optimistic thinking placeholder with the real AI message
    if (data.aiMessage) {
      store.replaceMessage('__ai_thinking__', { id: Date.now().toString(), role: 'ai', text: data.aiMessage })
    }

    store.setIsAiTyping(false)
    
    // Dual completion check: trust server flag OR detect we've advanced past the last field
    const actuallyComplete = data.isComplete || (data.nextFieldIndex !== undefined && data.nextFieldIndex >= fields.length)
    if (data.aiMessage) onSuccess(data.aiMessage, actuallyComplete)
  }, [form.id, store, fields])

  // --- VOICE LOGIC ---
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError, stream } = useVoiceRecorder(
    async (transcript, audioBlob) => {
      // Guard 1: Don't process if the AI is currently speaking.
      // This handles the race where VAD auto-stops during the filler phrase playback.
      if (isSpeakingRef.current) return

      // Guard 2: Don't process if we're already handling a transcription.
      // This handles rapid VAD double-fires from bouncing audio levels.
      if (isHandlingTranscriptRef.current) return
      isHandlingTranscriptRef.current = true

      const cleanTranscript = transcript.trim()

      // Short-circuit for empty/noise captures — replay the last question
      if (cleanTranscript.length < 2) {
        const lastAiMessage = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text
        const reprompt = lastAiMessage || "Sorry, I didn't quite catch that. Could you try again?"
        playSmartAudio(reprompt, () => {
          setVoiceState('idle')
          startRecording()
          isHandlingTranscriptRef.current = false
        }, true)
        return
      }

      const fieldIndex = store.currentFieldIndex
      const currentField = fields[fieldIndex]

      if (audioBlob) store.setAudioBlob(currentField.id, audioBlob)

      // Optimistic UI: push user message and thinking placeholder
      store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Voice] ${cleanTranscript}` })
      store.addMessage({ id: '__ai_thinking__', role: 'ai', text: getThinkingLabel(currentField?.field_type || 'text', cleanTranscript) })
      setVoiceState('thinking')

      // Speak filler immediately via NATIVE TTS while Gemini is working
      const fillerText = FILLERS[Math.floor(Math.random() * FILLERS.length)]
      let fetchSettled = false
      let fetchPayload: { aiMessage: string; isComplete: boolean } | null = null
      let fillerFinished = false

      function deliverAIResponse(aiMessage: string, isComplete: boolean) {
        playSmartAudio(aiMessage, () => {
          isHandlingTranscriptRef.current = false
          setVoiceState('idle')
          if (!isComplete) startRecording()
          else store.setMode('review')
        }, false)
      }

      handleConverseResponse(cleanTranscript, fieldIndex, 'voice', (aiMessage, isComplete) => {
        fetchSettled = true
        fetchPayload = { aiMessage, isComplete }
        if (fillerFinished) deliverAIResponse(aiMessage, isComplete)
      })

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(fillerText)
        utt.rate = 1.05
        utt.onend = () => {
          fillerFinished = true
          setVoiceState('thinking')
          if (fetchSettled && fetchPayload) deliverAIResponse(fetchPayload.aiMessage, fetchPayload.isComplete)
        }
        utt.onerror = () => { fillerFinished = true }
        window.speechSynthesis.speak(utt)
      } else {
        fillerFinished = true
      }
    },
    form.id,
  )

  useEffect(() => {
    if (isRecording) setVoiceState('listening')
    if (isProcessing) setVoiceState('transcribing')
    if (recorderError) setVoiceState('error')
  }, [isRecording, isProcessing, recorderError])

  // Start sequence based on mode
  useEffect(() => {
    if ((store.mode === 'text' || store.mode === 'voice') && store.history.length === 0) {
      handleInitialSequence(store.mode as 'text' | 'voice')
    }
  }, [store.mode])

  async function handleInitialSequence(mode: 'text' | 'voice') {
    if (mode === 'voice') {
      try {
        // 1. Request mic permission BEFORE starting the TTS sequence
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        tempStream.getTracks().forEach(t => t.stop()) // close it immediately once granted
        // Important: Initialize empty audio on direct click bypasses Apple's autoplay policy
        if (!audioRef) setAudioRef(new Audio())
      } catch (err) {
        // If they block the mic, fall back to text mode gracefully
        store.setMode('text')
        return
      }
      setVoiceState('thinking')
    }

    // Build prefill context for first call
    const prefillEntries = Object.entries(prefills)
    const prefillNote = prefillEntries.length > 0
      ? `Note: You already know the following about this user from the URL: ${prefillEntries.map(([k, v]) => `${k}=${v}`).join(', ')}. Acknowledge this naturally and ask for the first MISSING field.`
      : ''

    await handleConverseResponse('Hello', 0, mode, (aiMessage) => {
      if (mode === 'voice') {
        playSmartAudio(aiMessage, () => { setVoiceState('idle'); startRecording() })
      }
    }, prefillNote)
  }

  // --- TEXT LOGIC ---
  async function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || store.isAiTyping) return
    const userMsg = inputText.trim()
    setInputText('')
    store.addMessage({ id: Date.now().toString(), role: 'user', text: userMsg })
    const fieldIndex = store.currentFieldIndex
    await handleConverseResponse(userMsg, fieldIndex, 'text', (_, isComplete) => {
      if (isComplete) setTimeout(() => store.setMode('review'), 2000)
    })
  }

  async function handleSubmitForm() {
    setSubmitting(true)
    try {
      const inputMethod = store.history.some(h => h.role === 'user' && h.text.includes('[Voice]')) ? 'voice' : 'text'

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

  // --- RENDERS ---
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
            <button onClick={() => store.setMode('voice')} className="group flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-accent-amber/10 text-accent-amber hover:bg-accent-amber/20 border border-accent-amber/20 transition-all font-medium h-[200px]">
              <Mic className="h-10 w-10 group-hover:scale-110 transition-transform" />
              <span className="text-lg">Talk with me</span>
            </button>
            <button onClick={() => store.setMode('text')} className="group flex flex-col items-center justify-center gap-4 p-8 rounded-3xl bg-foreground/[0.03] text-foreground hover:bg-foreground/[0.05] border border-foreground/10 transition-all font-medium h-[200px]">
              <Keyboard className="h-10 w-10 group-hover:scale-110 transition-transform text-foreground/50" />
              <span className="text-lg">I'll Type</span>
            </button>
          </div>
        </motion.div>
      </main>
    )
  }

  if (store.mode === 'voice') {
    // The last AI message is the question currently being asked
    const lastAiText = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text ?? ''

    // Orb colour communicates state — no text labels needed
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
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 transition-colors duration-1000 ${
          voiceState === 'speaking' ? 'bg-accent-amber/8' : voiceState === 'listening' ? 'bg-accent-sage/8' : 'bg-transparent'
        }`} />

        {/* Top spacer */}
        <div />

        {/* Centre content */}
        <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="flex flex-col items-center gap-10 w-full max-w-sm mx-auto">

          {/* The only text on screen — current question */}
          <AnimatePresence mode="wait">
            {lastAiText && (
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
            )}
          </AnimatePresence>

          {/* Orb — tap to stop when listening */}
          <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            {/* Pulse ring — only during listening */}
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-accent-sage/30"
                animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              />
            )}

            {/* Waveform inside orb when listening */}
            <motion.button
              onClick={() => {
                if (voiceState === 'listening') stopRecording()
              }}
              className={`relative z-10 w-[140px] h-[140px] rounded-full flex flex-col items-center justify-center transition-colors duration-500 ${orbColour}`}
              animate={voiceState === 'thinking' || voiceState === 'transcribing' ? { scale: [0.97, 1, 0.97], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 1 }}
              transition={{ repeat: voiceState === 'thinking' || voiceState === 'transcribing' ? Infinity : 0, duration: 1.4 }}
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

        {/* Bottom escape hatch */}
        <button
          onClick={() => {
            isSpeakingRef.current = false
            window.speechSynthesis.cancel()
            if (audioRef) { audioRef.pause(); audioRef.currentTime = 0 }
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
                <div className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-3xl ${
                  msg.role === 'user'
                    ? 'bg-foreground/[0.05] text-foreground rounded-tr-sm'
                    : 'bg-transparent text-foreground font-serif text-xl sm:text-2xl leading-relaxed py-4'
                }`}>
                  {/* Only last AI message gets Typewriter */}
                  {msg.role === 'ai' && idx === store.history.length - 1 && !store.isAiTyping ? (
                    <Typewriter ref={typewriterRef} text={msg.text.replace('[Voice]', '')} speed={35} />
                  ) : (
                    msg.text.replace('[Voice]', '')
                  )}
                </div>
              </motion.div>
            ))}
            {store.isAiTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start text-foreground/30 font-serif text-xl p-4 py-4">
                <span className="animate-pulse">Thinking...</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 sm:p-6 pb-8 bg-gradient-to-t from-background via-background to-transparent">
          <form onSubmit={handleSendText} className="relative flex items-center">
            <input type="text" autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)}
              onFocus={() => typewriterRef.current?.finish()}
              disabled={store.isAiTyping} placeholder="Type your response..."
              className="w-full bg-foreground/[0.03] border border-foreground/10 text-foreground rounded-full pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-accent-amber/50 placeholder:text-foreground/30 disabled:opacity-50 transition-all font-sans"
            />
            <button type="submit" disabled={!inputText.trim() || store.isAiTyping}
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
                  <textarea value={store.answers[field.id] || ''} onChange={(e) => store.setAnswer(field.id, e.target.value)}
                    className="w-full bg-transparent border-b border-foreground/10 focus:border-foreground pb-1 focus:outline-none resize-none font-medium" rows={3} />
                ) : (
                  <input value={store.answers[field.id] || ''} onChange={(e) => store.setAnswer(field.id, e.target.value)}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : 'text'}
                    className="w-full bg-transparent border-b border-foreground/10 focus:border-foreground pb-1 focus:outline-none font-medium" />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        <div className="pt-6 pb-6 sticky bottom-0 bg-background/90 backdrop-blur-md shadow-[0_-20px_30px_rgba(0,0,0,0.05)]">
          <button onClick={handleSubmitForm} disabled={submitting}
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
          
          {/* Viral Powered-By Banner */}
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

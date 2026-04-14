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
}: {
  form: any
  fields: any[]
  prefills?: Record<string, string>
}) {
  const store = useConversationStore()
  const [inputText, setInputText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typewriterRef = useRef<TypewriterHandle>(null)

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

  // --- TTS ---
  const speak = useCallback((text: string, onEnd: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd(); return }
    setVoiceState('speaking')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = 1; utterance.rate = 1.05; utterance.pitch = 1
    utterance.onend = onEnd
    utterance.onerror = () => onEnd()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [])

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
    if (data.aiMessage) store.addMessage({ id: Date.now().toString(), role: 'ai', text: data.aiMessage })

    store.setIsAiTyping(false)
    
    // Dual completion check: trust server flag OR detect we've advanced past the last field
    const actuallyComplete = data.isComplete || (data.nextFieldIndex !== undefined && data.nextFieldIndex >= fields.length)
    if (data.aiMessage) onSuccess(data.aiMessage, actuallyComplete)
  }, [form.id, store, fields])

  // --- VOICE LOGIC ---
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError, stream } = useVoiceRecorder(
    async (transcript) => {
      store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Voice] ${transcript}` })
      const fieldIndex = store.currentFieldIndex
      await handleConverseResponse(transcript, fieldIndex, 'voice', (aiMessage, isComplete) => {
        speak(aiMessage, () => {
          setVoiceState('idle')
          if (!isComplete) startRecording()
          else store.setMode('review')
        })
      })
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
    if (mode === 'voice') setVoiceState('thinking')

    // Build prefill context for first call
    const prefillEntries = Object.entries(prefills)
    const prefillNote = prefillEntries.length > 0
      ? `Note: You already know the following about this user from the URL: ${prefillEntries.map(([k, v]) => `${k}=${v}`).join(', ')}. Acknowledge this naturally and ask for the first MISSING field.`
      : ''

    await handleConverseResponse('Hello', 0, mode, (aiMessage) => {
      if (mode === 'voice') {
        speak(aiMessage, () => { setVoiceState('idle'); startRecording() })
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
      await submitResponse(form.id, inputMethod, store.answers, store.history)
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
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
        <ConnectionLostToast />
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] transition-colors duration-1000 -z-10 ${voiceState === 'speaking' ? 'bg-accent-amber/10' : voiceState === 'listening' ? 'bg-accent-sage/10' : 'bg-transparent'}`} />

        <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="text-center w-full max-w-md mx-auto">
          <div className="h-48 w-48 mx-auto mb-12 relative flex items-center justify-center">
            {voiceState === 'listening' && (
              <motion.button onClick={stopRecording}
                initial={{ scale: 0.8 }} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-0 bg-accent-sage rounded-full flex flex-col items-center justify-center shadow-[0_0_40px_rgba(132,204,22,0.3)] hover:scale-95 transition-transform"
              >
                <div className="mb-3">
                  <Waveform stream={stream} isActive={isRecording} color="#000" />
                </div>
                <Square className="h-7 w-7 text-black fill-black" />
              </motion.button>
            )}
            {voiceState === 'speaking' && (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-accent-amber rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)]"
              />
            )}
            {voiceState === 'thinking' && (
              <motion.div animate={{ scale: [0.95, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-4 bg-foreground/20 rounded-full"
              />
            )}
            {voiceState === 'transcribing' && (
              <div className="absolute inset-0 border-4 border-foreground/10 border-t-foreground/50 rounded-full animate-spin" />
            )}
            {voiceState === 'error' && (
              <div className="absolute inset-0 bg-red-500/10 rounded-full flex items-center justify-center">
                <WifiOff className="h-12 w-12 text-red-400" />
              </div>
            )}
          </div>

          <div className="h-12 flex items-center justify-center">
            {voiceState === 'listening' && <p className="font-serif text-xl text-accent-sage">Listening...</p>}
            {voiceState === 'speaking' && <p className="font-serif text-xl text-accent-amber">Speaking...</p>}
            {voiceState === 'thinking' && <p className="font-serif text-xl text-foreground/50 animate-pulse">Thinking...</p>}
            {voiceState === 'transcribing' && <p className="font-serif text-xl text-foreground/50">Transcribing...</p>}
            {voiceState === 'error' && <p className="font-serif text-xl text-red-500">AI is sleeping. Switching to text...</p>}
          </div>

          <div className="mt-8 h-24 overflow-hidden">
            {store.history.slice(-2).map((msg) => (
              <div key={msg.id} className={`mb-2 font-serif text-lg ${msg.role === 'ai' ? 'text-foreground' : 'text-foreground/40'}`}>
                {msg.text.replace('[Voice]', '')}
              </div>
            ))}
          </div>

          <button onClick={() => { window.speechSynthesis.cancel(); stopRecording(); store.setMode('text') }}
            className="mt-12 text-sm text-foreground/40 hover:text-foreground/80 transition-colors"
          >
            Switch to Keyboard
          </button>
        </motion.div>
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

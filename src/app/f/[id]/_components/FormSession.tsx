'use client'

import { useEffect, useState, useRef } from 'react'
import { useConversationStore } from '@/lib/store/conversation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Keyboard, Send, CheckCircle2, Loader2, Square } from 'lucide-react'
import { submitResponse } from '@/lib/actions/submit'
import { useVoiceRecorder } from '@/lib/hooks/useVoiceRecorder'

type VoiceState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'transcribing' | 'error'

export default function FormSession({ form, fields }: { form: any, fields: any[] }) {
  const store = useConversationStore()
  const [inputText, setInputText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    } catch(e) { }
  }

  useEffect(() => {
    store.init(form.id, fields)
    return () => window.speechSynthesis.cancel() // Stop speaking if unmounted
  }, [form.id])

  useEffect(() => {
    if (store.mode === 'text' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [store.history, store.isAiTyping, store.mode])

  // --- TTS LOGIC ---
  const speak = (text: string, onEnd: () => void) => {
    if (!('speechSynthesis' in window)) {
      onEnd()
      return
    }
    setVoiceState('speaking')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.volume = 1
    utterance.rate = 1.05
    utterance.pitch = 1
    utterance.onend = onEnd
    utterance.onerror = (e) => {
      console.error('TTS Error', e)
      onEnd()
    }
    window.speechSynthesis.cancel() // clear queue
    window.speechSynthesis.speak(utterance)
  }

  // --- VOICE LOGIC ---
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError } = useVoiceRecorder(async (transcript) => {
    // 1. Transcription complete
    store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Voice] ${transcript}` })
    
    // 2. Process conversation
    setVoiceState('thinking')
    store.setIsAiTyping(true)
    try {
      const res = await fetch('/api/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: form.id,
          currentFieldIndex: store.currentFieldIndex,
          history: store.history.concat({ id: 'temp', role: 'user', text: transcript }),
          userMessage: transcript
        })
      })
      const data = await res.json()
      
      if (data.extractedValue) store.setAnswer(fields[store.currentFieldIndex].id, data.extractedValue)
      if (data.nextFieldIndex !== undefined) store.setNextField(data.nextFieldIndex)

      if (data.aiMessage) {
        store.addMessage({ id: Date.now().toString(), role: 'ai', text: data.aiMessage })
        if (!data.isComplete) {
          speak(data.aiMessage, () => {
            setVoiceState('idle')
            startRecording() 
          })
        } else {
          speak(data.aiMessage, () => {
            setVoiceState('idle')
            store.setMode('review')
          })
        }
      }
    } catch (e) {
      console.error(e)
      setVoiceState('error')
    } finally {
      store.setIsAiTyping(false)
    }
  }, form.id)

  // Sync recorder states to voiceState
  useEffect(() => {
    if (isRecording) setVoiceState('listening')
    if (isProcessing) setVoiceState('transcribing')
    if (recorderError) setVoiceState('error')
  }, [isRecording, isProcessing, recorderError])

  // Start sequence based on mode
  useEffect(() => {
    if (store.mode === 'text' && store.history.length === 0) {
      handleInitialSequence('text')
    } else if (store.mode === 'voice' && store.history.length === 0) {
      handleInitialSequence('voice')
    }
  }, [store.mode])

  async function handleInitialSequence(mode: 'text' | 'voice') {
    store.setIsAiTyping(true)
    if (mode === 'voice') setVoiceState('thinking')
    
    try {
      const res = await fetch('/api/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: form.id,
          currentFieldIndex: 0,
          history: [],
          userMessage: "Hello"
        })
      })
      const data = await res.json()
      if (data.aiMessage) {
        store.addMessage({ id: Date.now().toString(), role: 'ai', text: data.aiMessage })
        if (mode === 'voice') {
           speak(data.aiMessage, () => {
             setVoiceState('idle')
             startRecording()
           })
        }
      }
    } catch (e) {
      console.error(e)
      setVoiceState('error')
    } finally {
      store.setIsAiTyping(false)
    }
  }

  // --- TEXT LOGIC ---
  async function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim()) return

    const userMsg = inputText.trim()
    setInputText('')
    store.addMessage({ id: Date.now().toString(), role: 'user', text: userMsg })
    store.setIsAiTyping(true)

    try {
      const res = await fetch('/api/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId: form.id,
          currentFieldIndex: store.currentFieldIndex,
          history: store.history.concat({ id: 'temp', role: 'user', text: userMsg }),
          userMessage: userMsg
        })
      })
      const data = await res.json()
      
      if (data.extractedValue) store.setAnswer(fields[store.currentFieldIndex].id, data.extractedValue)
      if (data.nextFieldIndex !== undefined) store.setNextField(data.nextFieldIndex)

      if (data.aiMessage) {
        store.addMessage({ id: Date.now().toString(), role: 'ai', text: data.aiMessage })
      }

      if (data.isComplete) {
        setTimeout(() => store.setMode('review'), 2500)
      }
    } catch (e) {
      console.error(e)
    } finally {
      store.setIsAiTyping(false)
    }
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
      alert("Failed to submit")
    } finally {
      setSubmitting(false)
    }
  }

  // --- RENDERS ---
  if (store.mode === 'choice') {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
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
          {/* Subtle bg glow when speaking */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[100px] transition-colors duration-1000 -z-10 ${voiceState === 'speaking' ? 'bg-accent-amber/10' : voiceState === 'listening' ? 'bg-accent-sage/10' : 'bg-transparent'}`} />

          <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="text-center w-full max-w-md mx-auto">
             
             {/* The Magic Orb / Visualizer */}
             <div className="h-48 w-48 mx-auto mb-12 relative flex items-center justify-center">
                {/* Listening State (Waveform analog) */}
                {voiceState === 'listening' && (
                  <motion.button 
                    onClick={stopRecording}
                    initial={{ scale: 0.8 }} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 bg-accent-sage rounded-full flex flex-col items-center justify-center shadow-[0_0_40px_rgba(132,204,22,0.3)] hover:scale-95 transition-transform"
                  >
                    <Square className="h-10 w-10 text-background fill-background mb-2" />
                    <span className="text-background text-xs font-semibold uppercase tracking-widest">Tap to stop</span>
                  </motion.button>
                )}

                {/* Speaking State (Expansive) */}
                {voiceState === 'speaking' && (
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-accent-amber rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.3)]"
                  />
                )}

                {/* Thinking State (Pulse) */}
                {voiceState === 'thinking' && (
                  <motion.div 
                    animate={{ scale: [0.95, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-4 bg-foreground/20 rounded-full"
                  />
                )}

                {/* Transcribing State */}
                {voiceState === 'transcribing' && (
                  <div className="absolute inset-0 border-4 border-foreground/10 border-t-foreground/50 rounded-full animate-spin" />
                )}
             </div>

             {/* Status Text */}
             <div className="h-12 flex items-center justify-center">
                 {voiceState === 'listening' && <p className="font-serif text-xl text-accent-sage">Listening...</p>}
                 {voiceState === 'speaking' && <p className="font-serif text-xl text-accent-amber">Speaking...</p>}
                 {voiceState === 'thinking' && <p className="font-serif text-xl text-foreground/50 animate-pulse">Thinking...</p>}
                 {voiceState === 'transcribing' && <p className="font-serif text-xl text-foreground/50">Transcribing...</p>}
                 {voiceState === 'error' && <p className="font-serif text-xl text-red-500">Something went wrong. Let's try text mode.</p>}
             </div>

             {/* Live Chat Subtitles */}
             <div className="mt-8 h-24 overflow-hidden mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)">
               {store.history.slice(-2).map((msg, i) => (
                 <div key={msg.id} className={`mb-2 font-serif text-lg ${msg.role === 'ai' ? 'text-foreground' : 'text-foreground/40'}`}>
                   {msg.role === 'user' ? (msg.text.replace('[Voice]', '')) : msg.text}
                 </div>
               ))}
             </div>

             <button onClick={() => { window.speechSynthesis.cancel(); stopRecording(); store.setMode('text') }} className="mt-12 text-sm text-foreground/40 hover:text-foreground/80 transition-colors">
               Switch to Keyboard
             </button>
          </motion.div>
       </main>
     )
  }

  if (store.mode === 'text') {
    return (
      <main className="min-h-[100dvh] flex flex-col bg-background max-w-3xl mx-auto w-full relative">
        <header className="p-4 sm:p-6 pb-2 border-b border-foreground/5 bg-background/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
          <h2 className="font-serif font-medium text-foreground tracking-tight truncate pr-4">{form.title}</h2>
          <button onClick={() => store.setMode('review')} className="text-xs text-foreground/40 hover:text-foreground">Skip to review</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <AnimatePresence>
            {store.history.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`
                  max-w-[85%] sm:max-w-[75%] p-4 rounded-3xl 
                  ${msg.role === 'user' 
                    ? 'bg-foreground/[0.05] text-foreground rounded-tr-sm' 
                    : 'bg-transparent text-foreground font-serif text-xl sm:text-2xl leading-relaxed py-4'}
                `}>
                  {msg.text.replace('[Voice]', '')}
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
             <input 
               type="text"
               autoFocus
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
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
             <p className="text-foreground/60">We've extracted this from our conversation. Feel free to edit anything before submitting.</p>
           </header>

           <div className="space-y-6 flex-1 pr-1 pb-10">
             {fields.map(field => (
                <div key={field.id} className="bg-foreground/[0.02] border border-foreground/5 p-5 border-l-4 border-l-accent-sage rounded-r-2xl">
                   <label className="block text-sm font-medium text-foreground/70 mb-2">{field.label}</label>
                   {field.field_type === 'textarea' ? (
                     <textarea 
                       value={store.answers[field.id] || ''}
                       onChange={e => store.setAnswer(field.id, e.target.value)}
                       className="w-full bg-transparent border-b border-foreground/10 focus:border-foreground pb-1 focus:outline-none resize-none font-medium"
                       rows={3}
                     />
                   ) : (
                     <input 
                       value={store.answers[field.id] || ''}
                       onChange={e => store.setAnswer(field.id, e.target.value)}
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
             <p className="text-foreground/70">
                Your answers have been securely submitted directly to the creator of "{form.title}".
             </p>
             <p className="mt-8 text-xs text-foreground/40 font-medium tracking-wide uppercase">
                Powered by Voca
             </p>
          </motion.div>
       </main>
    )
  }

  return null
}

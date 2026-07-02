'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { saveForm } from '@/lib/actions/forms'
import {
  Loader2, Mic, Square, Sparkles, ArrowRight,
  Star, Briefcase, PartyPopper, LineChart, Microscope, Rocket,
} from 'lucide-react'
import FormBuilder, { type BuilderSchema } from '@/components/admin/FormBuilder'

const TEMPLATES = [
  {
    name: 'Customer feedback',
    icon: Star,
    prompt: 'Ask for their name, email, how they heard about us, overall satisfaction out of 10, what they liked most, and what could be better.',
  },
  {
    name: 'Job application',
    icon: Briefcase,
    prompt: 'Ask for applicant name, email, phone, position applied for, years of relevant experience, top skills, why they want this role, and a portfolio or LinkedIn URL.',
  },
  {
    name: 'Event RSVP',
    icon: PartyPopper,
    prompt: 'Ask for attendee name, email, number of guests, dietary restrictions, preferred session (morning or afternoon), and any special requests.',
  },
  {
    name: 'Product survey',
    icon: LineChart,
    prompt: 'Ask for tester name, email, product rating out of 10, features they use most, what is missing, and whether they would recommend the product to a friend.',
  },
  {
    name: 'Research interview',
    icon: Microscope,
    prompt: 'Ask for participant name, age group, profession, the primary challenge they face, current solutions they use, and what would make their life significantly easier.',
  },
  {
    name: 'User onboarding',
    icon: Rocket,
    prompt: 'Ask for name, email, company name, team size, main use case they are signing up for, and their biggest goal for the first 30 days.',
  },
]

export default function CreateFormPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [step, setStep] = useState<'prompt' | 'generating' | 'review'>('prompt')
  const [schema, setSchema] = useState<BuilderSchema | null>(null)
  const [error, setError] = useState('')

  // Inline voice dictation for the prompt box
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [voiceError, setVoiceError] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!prompt.trim()) return
    setStep('generating')
    setError('')
    try {
      const res = await fetch('/api/create-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate schema')
      setSchema({
        ai_tone: 'friendly',
        default_language: 'en',
        ai_context: '',
        ...data.schema,
      })
      setStep('review')
    } catch (err: any) {
      setError(err.message)
      setStep('prompt')
    }
  }

  const startListening = useCallback(async () => {
    setVoiceError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType })
      audioChunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setVoiceState('processing')
        try {
          const blob = new Blob(audioChunks.current, { type: mimeType })
          const formData = new FormData()
          formData.append('audio', blob, `recording.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`)
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.transcript) {
            setPrompt(prev => (prev ? prev + ' ' + data.transcript : data.transcript))
            textareaRef.current?.focus()
          } else {
            setVoiceError('No speech detected. Try again.')
          }
        } catch {
          setVoiceError('Transcription failed. Try again.')
        } finally {
          setVoiceState('idle')
        }
      }
      rec.start()
      mediaRecorder.current = rec
      setVoiceState('listening')
    } catch {
      setVoiceError('Microphone access denied.')
      setVoiceState('idle')
    }
  }, [])

  const stopListening = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
  }, [])

  useEffect(() => () => { mediaRecorder.current?.stop() }, [])

  async function handleConfirm(edited: BuilderSchema) {
    try {
      const formId = await saveForm(edited.title, edited.description, edited.fields, {
        ai_tone: edited.ai_tone,
        ai_context: edited.ai_context,
        welcome_message: edited.welcome_message,
        default_language: edited.default_language,
      })
      router.push(`/admin/forms/${formId}?new=1`)
    } catch (err: any) {
      return { error: err.message }
    }
  }

  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      {step === 'prompt' && (
        <div className="space-y-10 animate-in fade-in zoom-in-95 duration-300">
          {/* ── Prompt-first hero ── */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">What do you want to ask?</h1>
            <p className="mt-3 text-base text-foreground/55">
              Describe your form in plain words. Voca turns it into a voice conversation.
            </p>
          </div>

          <form onSubmit={handleGenerate}>
            <div className={`rounded-3xl border bg-foreground/[0.02] transition-all ${
              voiceState === 'listening'
                ? 'border-accent-sage/50 ring-2 ring-accent-sage/15'
                : 'border-foreground/10 focus-within:border-accent-amber/50 focus-within:ring-2 focus-within:ring-accent-amber/10'
            }`}>
              <textarea
                ref={textareaRef}
                autoFocus
                rows={4}
                maxLength={2000}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
                placeholder="e.g. Collect RSVPs for our launch party: name, email, number of guests, dietary needs, and whether they want a demo slot."
                className="w-full resize-none bg-transparent px-6 pt-5 pb-2 text-base text-foreground placeholder:text-foreground/30 focus:outline-none"
              />
              <div className="flex items-center justify-between px-4 pb-4">
                {/* Inline dictation */}
                <button
                  type="button"
                  onClick={voiceState === 'listening' ? stopListening : voiceState === 'idle' ? startListening : undefined}
                  aria-label={voiceState === 'listening' ? 'Stop dictating' : 'Dictate your form'}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                    voiceState === 'listening'
                      ? 'bg-accent-sage text-black animate-pulse'
                      : voiceState === 'processing'
                        ? 'bg-foreground/[0.05] text-foreground/40'
                        : 'bg-foreground/[0.05] text-foreground/50 hover:bg-foreground/[0.1] hover:text-foreground'
                  }`}
                >
                  {voiceState === 'processing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : voiceState === 'listening' ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="submit"
                  disabled={!prompt.trim() || voiceState !== 'idle'}
                  className="flex items-center gap-2 rounded-full bg-accent-amber px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate form
                </button>
              </div>
            </div>
            {voiceState === 'listening' && (
              <p className="mt-2 text-center text-sm text-accent-sage animate-pulse">Listening. Tap the square to stop.</p>
            )}
            {voiceError && <p className="mt-2 text-center text-sm text-red-500">{voiceError}</p>}
            {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
          </form>

          {/* ── Templates (secondary) ── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/35 mb-3 text-center">
              Or start from a template
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => {
                    setPrompt(t.prompt)
                    textareaRef.current?.focus()
                  }}
                  className="flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/70 hover:border-foreground/25 hover:text-foreground hover:bg-foreground/[0.06] transition-all"
                >
                  <t.icon className="h-3.5 w-3.5 text-accent-amber/80" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="py-24 flex flex-col items-center justify-center animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-accent-amber" />
          <p className="text-base animate-pulse text-foreground">Designing your conversation...</p>
        </div>
      )}

      {step === 'review' && schema && (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 fade-in duration-500">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Review &amp; adjust</h1>
            <p className="text-foreground/60 flex items-center gap-1.5">
              Fine-tune the questions and the AI&apos;s personality, then publish.
              <ArrowRight className="h-3.5 w-3.5 text-foreground/30" />
            </p>
          </div>

          <FormBuilder
            initialSchema={schema}
            onSave={handleConfirm}
            saveLabel="Publish form"
            savingLabel="Publishing..."
          />
        </div>
      )}
    </main>
  )
}

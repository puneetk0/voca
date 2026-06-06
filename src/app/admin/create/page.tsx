'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { saveForm } from '@/lib/actions/forms'
import { Loader2, Plus, Trash2, CheckCircle2, Mic, Square, MicOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type Field = { label: string; field_type: string; required: boolean; options?: string[] }
type Schema = { title: string; description: string; fields: Field[] }
type InputMode = 'text' | 'voice'

export default function CreateFormPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [step, setStep] = useState<'prompt' | 'generating' | 'review' | 'saving'>('prompt')
  const [schema, setSchema] = useState<Schema | null>(null)
  const [error, setError] = useState('')
  const [inputMode, setInputMode] = useState<InputMode>('text')

  // --- Voice recording state ---
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [voiceError, setVoiceError] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])

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
      setSchema(data.schema)
      setStep('review')
    } catch (err: any) {
      setError(err.message)
      setStep('prompt')
    }
  }

  // --- Voice recording logic ---
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
          // We re-use the same /api/transcribe endpoint
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.transcript) {
            setPrompt((prev) => (prev ? prev + ' ' + data.transcript : data.transcript))
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

  // Cleanup on unmount
  useEffect(() => () => { mediaRecorder.current?.stop() }, [])

  function updateField(idx: number, updates: Partial<Field>) {
    if (!schema) return
    const newFields = [...schema.fields]
    newFields[idx] = { ...newFields[idx], ...updates }
    setSchema({ ...schema, fields: newFields })
  }

  function addField() {
    if (!schema) return
    setSchema({ ...schema, fields: [...schema.fields, { label: 'New Field', field_type: 'text', required: false, options: [] }] })
  }

  function removeField(idx: number) {
    if (!schema) return
    const newFields = [...schema.fields]
    newFields.splice(idx, 1)
    setSchema({ ...schema, fields: newFields })
  }

  async function handleConfirm() {
    if (!schema) return
    setStep('saving')
    setError('')
    try {
      const formId = await saveForm(schema.title, schema.description, schema.fields)
      router.push(`/admin/forms/${formId}`)
    } catch (err: any) {
      setError(err.message)
      setStep('review')
    }
  }

  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      {step === 'prompt' && (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Create a Natural Form</h1>
            <p className="mt-3 text-lg text-foreground/70 font-light">
              Describe what you want to collect. Our AI will design the form for you.
            </p>
          </div>

          {/* Input Mode Toggle */}
          <div className="flex items-center gap-2 p-1 bg-foreground/[0.04] rounded-full w-fit border border-foreground/10">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${inputMode === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/50 hover:text-foreground'}`}
            >
              ✍️ Type
            </button>
            <button
              type="button"
              onClick={() => setInputMode('voice')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${inputMode === 'voice' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/50 hover:text-foreground'}`}
            >
              🎙️ Speak
            </button>
          </div>

          {inputMode === 'text' && (
            <form onSubmit={handleGenerate} className="space-y-4">
              <textarea
                autoFocus
                required
                rows={4}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Ask for their name, age, college preferences, and what kind of tech stack they like."
                className="w-full resize-none rounded-2xl bg-foreground/[0.03] border border-foreground/10 px-6 py-5 text-lg text-foreground shadow-sm placeholder:text-foreground/30 focus:border-accent-sage focus:ring-accent-sage focus:outline-none transition-all"
              />
              {error && <div className="text-red-500 text-sm px-2">{error}</div>}
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="inline-flex rounded-full bg-accent-sage px-8 py-3 text-sm font-semibold text-black hover:opacity-90 transition-all font-sans disabled:opacity-40"
              >
                Draft Form Schema
              </button>
            </form>
          )}

          {inputMode === 'voice' && (
            <div className="space-y-6">
              {/* Orb */}
              <div className="flex flex-col items-center gap-6 py-4">
                <div className="relative h-36 w-36 flex items-center justify-center">
                  {/* Background glow */}
                  <div className={`absolute inset-0 rounded-full blur-xl transition-all duration-700 ${voiceState === 'listening' ? 'bg-accent-sage/20 scale-125' : voiceState === 'processing' ? 'bg-accent-amber/15' : 'bg-foreground/5'}`} />
                  
                  {voiceState === 'idle' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={startListening}
                      className="relative z-10 h-28 w-28 rounded-full bg-foreground/[0.06] border-2 border-foreground/10 flex items-center justify-center hover:border-accent-sage/50 hover:bg-accent-sage/10 transition-all"
                    >
                      <Mic className="h-12 w-12 text-foreground/50" />
                    </motion.button>
                  )}

                  {voiceState === 'listening' && (
                    <motion.button
                      onClick={stopListening}
                      animate={{ scale: [1, 1.06, 1], boxShadow: ['0 0 0 0 rgba(132,204,22,0.3)', '0 0 0 16px rgba(132,204,22,0)', '0 0 0 0 rgba(132,204,22,0)'] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="relative z-10 h-28 w-28 rounded-full bg-accent-sage flex items-center justify-center cursor-pointer"
                    >
                      <Square className="h-10 w-10 text-black fill-black" />
                    </motion.button>
                  )}

                  {voiceState === 'processing' && (
                    <div className="relative z-10 h-28 w-28 rounded-full bg-accent-amber/10 border-2 border-accent-amber/30 flex items-center justify-center">
                      <Loader2 className="h-10 w-10 text-accent-amber animate-spin" />
                    </div>
                  )}
                </div>

                <div className="text-center">
                  {voiceState === 'idle' && <p className="text-foreground/60 text-sm">Tap to start describing your form</p>}
                  {voiceState === 'listening' && <p className="text-accent-sage font-medium animate-pulse">Listening... tap to stop</p>}
                  {voiceState === 'processing' && <p className="text-accent-amber text-sm">Transcribing your voice...</p>}
                </div>
              </div>

              {/* Transcript preview */}
              {prompt && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative">
                  <textarea
                    rows={3}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    className="w-full resize-none rounded-2xl bg-foreground/[0.03] border border-foreground/10 px-6 py-4 text-base text-foreground placeholder:text-foreground/30 focus:border-accent-sage focus:outline-none transition-all"
                    placeholder="Your spoken description will appear here..."
                  />
                  <p className="text-xs text-foreground/40 mt-2 px-1">You can edit this before generating.</p>
                </motion.div>
              )}

              {voiceError && (
                <div className="flex items-center gap-2 text-red-400 text-sm px-2">
                  <MicOff className="h-4 w-4" />
                  {voiceError}
                </div>
              )}

              {error && <div className="text-red-500 text-sm px-2">{error}</div>}

              <div className="flex gap-3 flex-wrap">
                {voiceState === 'idle' && (
                  <button
                    onClick={startListening}
                    className="flex items-center gap-2 rounded-full border border-foreground/15 px-6 py-2.5 text-sm font-medium text-foreground/70 hover:text-foreground hover:border-accent-sage/50 transition-all"
                  >
                    <Mic className="h-4 w-4" /> Add more
                  </button>
                )}
                <button
                  onClick={() => handleGenerate()}
                  disabled={!prompt.trim() || voiceState !== 'idle'}
                  className="inline-flex items-center gap-2 rounded-full bg-accent-sage px-8 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" /> Draft Form Schema
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'generating' && (
        <div className="py-24 flex flex-col items-center justify-center text-accent-amber animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4" />
          <p className="text-base animate-pulse text-foreground">Thinking and designing schema...</p>
        </div>
      )}

      {step === 'saving' && (
        <div className="py-24 flex flex-col items-center justify-center text-accent-sage animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4" />
          <p className="text-base font-medium text-foreground">Saving form securely...</p>
        </div>
      )}

      {step === 'review' && schema && (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 fade-in duration-500">
          <div>
            <h1 className="text-2xl font-semibold mb-2">Review & Adjust</h1>
            <p className="text-foreground/60">Edit the generated fields before publishing.</p>
          </div>

          <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 rounded-3xl p-8">
            <input
              value={schema.title}
              onChange={e => setSchema({ ...schema, title: e.target.value })}
              className="w-full bg-transparent text-xl font-semibold border-b border-foreground/10 pb-2 focus:outline-none focus:border-accent-amber transition-colors"
            />
            <input
              value={schema.description}
              onChange={e => setSchema({ ...schema, description: e.target.value })}
              placeholder="Form description"
              className="w-full bg-transparent text-foreground/60 border-b border-transparent hover:border-foreground/10 pb-1 focus:outline-none focus:border-accent-amber transition-colors"
            />

            <div className="pt-6 space-y-3">
              <h3 className="text-sm font-semibold text-foreground bg-foreground/[0.05] inline-block px-3 py-1 rounded-full mb-4">Fields</h3>
              {schema.fields.map((field, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex gap-4 items-center bg-background p-4 rounded-xl border border-foreground/5 shadow-sm group">
                    <input
                      value={field.label}
                      onChange={e => updateField(i, { label: e.target.value })}
                      className="flex-1 bg-transparent font-medium focus:outline-none"
                      placeholder="Field label"
                    />
                    <select
                      value={field.field_type}
                      onChange={e => updateField(i, { field_type: e.target.value, options: e.target.value === 'mcq' ? (field.options || ['Option A', 'Option B']) : [] })}
                      className="bg-foreground/[0.03] border-none rounded-lg text-sm px-3 py-1.5 min-w-[120px] focus:ring-0"
                    >
                      <option value="text">Short Text</option>
                      <option value="textarea">Long Text</option>
                      <option value="number">Number</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      <option value="mcq">Multiple Choice</option>
                      <option value="file">File Upload</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateField(i, { required: e.target.checked })}
                        className="rounded border-foreground/20 text-accent-amber focus:ring-accent-amber bg-transparent"
                      />
                      Required
                    </label>
                    <button
                      onClick={() => removeField(i)}
                      className="p-2 text-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-400/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {/* MCQ Options Editor */}
                  {field.field_type === 'mcq' && (
                    <div className="ml-4 flex flex-wrap gap-2 items-center pb-1">
                      {(field.options || []).map((opt, oi) => (
                        <span key={oi} className="flex items-center gap-1 bg-accent-amber/10 border border-accent-amber/20 rounded-full px-3 py-1 text-xs font-medium">
                          <input
                            value={opt}
                            onChange={e => {
                              const newOpts = [...(field.options || [])]
                              newOpts[oi] = e.target.value
                              updateField(i, { options: newOpts })
                            }}
                            className="bg-transparent focus:outline-none w-20"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (field.options || []).filter((_, idx) => idx !== oi)
                              updateField(i, { options: newOpts })
                            }}
                            className="text-foreground/40 hover:text-red-400 transition-colors"
                          >{'×'}</button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateField(i, { options: [...(field.options || []), `Option ${(field.options?.length ?? 0) + 1}`] })}
                        className="text-xs text-accent-amber hover:opacity-80 transition-opacity"
                      >+ Add option</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addField}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 px-4 py-2 rounded-xl transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Field
            </button>
          </div>

          {error && <div className="text-red-500 text-sm px-2 text-center">{error}</div>}

          <div className="flex justify-end pt-4">
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 rounded-full bg-accent-amber px-8 py-3.5 text-sm font-semibold text-black shadow-sm hover:opacity-90 transition-opacity"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Publish Form
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mic, Keyboard, PlayCircle, PauseCircle, Loader2, MessageSquare, ChevronDown } from 'lucide-react'
import { getResponseTranscript, type TranscriptMessage } from '@/lib/actions/transcripts'

export interface DrawerField { id: string; label: string; order_index: number }
export interface DrawerAnswer { response_id: string; field_id: string; value: string; audio_url?: string | null; sentiment?: string | null }
export interface DrawerResponse { id: string; input_method: string; submitted_at: string }

interface Props {
  response: DrawerResponse | null
  fields: DrawerField[]
  answers: DrawerAnswer[]
  onClose: () => void
}

function AudioPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { ref.current?.pause() }, [])

  function toggle() {
    if (isPlaying && ref.current) { ref.current.pause(); setIsPlaying(false); return }
    if (!ref.current) {
      setIsLoading(true)
      const a = new Audio(url)
      a.oncanplay = () => { setIsLoading(false); a.play() }
      a.onplay = () => setIsPlaying(true)
      a.onpause = () => setIsPlaying(false)
      a.onended = () => setIsPlaying(false)
      a.onerror = () => { setIsLoading(false); setIsPlaying(false) }
      ref.current = a
      a.play().catch(() => {})
    } else {
      ref.current.play()
    }
  }

  return (
    <button onClick={toggle} disabled={isLoading} className="flex items-center gap-1.5 text-xs text-accent-sage hover:opacity-80 transition-opacity mt-1">
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPlaying ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
      {isPlaying ? 'Pause' : 'Play audio'}
    </button>
  )
}

const SENTIMENT: Record<string, { label: string; cls: string }> = {
  positive:   { label: 'Positive',   cls: 'text-accent-sage' },
  neutral:    { label: 'Neutral',    cls: 'text-foreground/50' },
  hesitant:   { label: 'Hesitant',   cls: 'text-accent-amber' },
  frustrated: { label: 'Frustrated', cls: 'text-accent-rose' },
}

export function ResponseDrawer({ response, fields, answers, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const responseAnswers = response ? answers.filter(a => a.response_id === response.id) : []
  const answerMap = new Map(responseAnswers.map(a => [a.field_id, a]))

  // Load the conversation transcript on demand when a response is opened.
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null)
  const [loadingTx, setLoadingTx] = useState(false)
  const [showTx, setShowTx] = useState(false)

  useEffect(() => {
    if (!response) { setTranscript(null); setShowTx(false); return }
    let cancelled = false
    setLoadingTx(true)
    setTranscript(null)
    getResponseTranscript(response.id)
      .then(res => { if (!cancelled) setTranscript(res.messages) })
      .finally(() => { if (!cancelled) setLoadingTx(false) })
    return () => { cancelled = true }
  }, [response])

  return (
    <AnimatePresence>
      {response && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-foreground/10 z-50 flex flex-col shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-foreground/8 shrink-0">
              <div>
                <p className="font-semibold text-sm">Response detail</p>
                <p className="text-xs text-foreground/40 mt-0.5">
                  {new Date(response.submitted_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {response.input_method === 'voice' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-sage/10 px-2.5 py-1 text-xs font-medium text-accent-sage ring-1 ring-inset ring-accent-sage/20">
                    <Mic className="h-3 w-3" /> Voice
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/60 ring-1 ring-inset ring-foreground/20">
                    <Keyboard className="h-3 w-3" /> Text
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="flex items-center justify-center h-8 w-8 rounded-full text-foreground/40 hover:text-foreground hover:bg-foreground/8 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {fields.map(field => {
                const ans = answerMap.get(field.id)
                const sentCfg = ans?.sentiment ? SENTIMENT[ans.sentiment] : null

                return (
                  <div key={field.id}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-foreground/40 uppercase tracking-wide">{field.label}</p>
                      {sentCfg && <span className={`text-xs font-medium ${sentCfg.cls}`}>{sentCfg.label}</span>}
                    </div>
                    {ans?.value ? (
                      <div>
                        {(() => {
                          const v = ans.value
                          const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v)
                          const isVid = /\.(mp4|mov|webm|ogg)$/i.test(v)
                          const isUrl = v.startsWith('http')
                          if (isImg && isUrl) return (
                            <a href={v} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={v} alt="" className="max-h-48 rounded-xl object-cover border border-foreground/10" />
                            </a>
                          )
                          if (isVid && isUrl) return <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent-amber text-sm hover:opacity-80">🎬 View video</a>
                          if (isUrl) return <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent-amber text-sm hover:opacity-80 block truncate">📎 View file</a>
                          return <p className="text-sm text-foreground bg-foreground/[0.02] border border-foreground/8 rounded-xl px-4 py-3 leading-relaxed">{v}</p>
                        })()}
                        {ans.audio_url && <AudioPlayer url={ans.audio_url} />}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/30 italic">Skipped</p>
                    )}
                  </div>
                )
              })}

              {/* Conversation transcript */}
              {(loadingTx || (transcript && transcript.length > 0)) && (
                <div className="pt-2 border-t border-foreground/8">
                  <button
                    onClick={() => setShowTx(v => !v)}
                    className="flex items-center gap-2 w-full text-xs font-medium text-foreground/50 hover:text-foreground/80 transition-colors py-1"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Conversation transcript
                    {loadingTx && <Loader2 className="h-3 w-3 animate-spin" />}
                    {transcript && transcript.length > 0 && (
                      <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${showTx ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                  {showTx && transcript && (
                    <div className="mt-3 space-y-2">
                      {transcript
                        .filter(m => m.text && m.id !== '__ai_thinking__')
                        .map((m, i) => (
                          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                              m.role === 'user'
                                ? 'bg-accent-amber/15 text-foreground rounded-br-sm'
                                : 'bg-foreground/[0.04] text-foreground/80 rounded-bl-sm'
                            }`}>
                              {m.text.replace('[Voice] ', '')}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

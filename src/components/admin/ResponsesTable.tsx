'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mic, Keyboard, PlayCircle, PauseCircle, Loader2 } from 'lucide-react'

interface Field { id: string; label: string; order_index: number }
interface Answer { response_id: string; field_id: string; value: string; audio_url?: string | null; sentiment?: string | null }
interface Response { id: string; input_method: string; submitted_at: string }

interface Props {
  formId: string
  fields: Field[]
  initialResponses: Response[]
  initialAnswers: Answer[]
}

function MinimalAudioPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const togglePlay = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    if (!audioRef.current) {
      setIsLoading(true)
      const audio = new Audio(url)
      
      audio.oncanplay = () => {
        setIsLoading(false)
        audio.play()
      }
      
      audio.onplay = () => setIsPlaying(true)
      audio.onpause = () => setIsPlaying(false)
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsLoading(false)
        setIsPlaying(false)
      }
      
      audioRef.current = audio
      
      // Attempt play immediately, helps bypass some stricter mobile protections if buffered quickly
      audio.play().catch(() => {})
    } else {
      audioRef.current.play()
    }
  }

  return (
    <button
      onClick={togglePlay}
      disabled={isLoading}
      title="Listen to response"
      className="shrink-0 flex items-center justify-center rounded-full p-1 bg-accent-sage/10 text-accent-sage hover:bg-accent-sage/20 transition-colors ring-1 ring-inset ring-accent-sage/20"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isPlaying ? (
        <PauseCircle className="h-3.5 w-3.5 fill-accent-sage text-black" />
      ) : (
        <PlayCircle className="h-3.5 w-3.5 fill-accent-sage text-black" />
      )}
    </button>
  )
}

export default function ResponsesTable({ formId, fields, initialResponses, initialAnswers }: Props) {
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [answers, setAnswers] = useState<Answer[]>(initialAnswers)

  // O(1) lookup map: "responseId::fieldId" -> Answer
  // Prevents O(n×m) nested loops on every render when responses + fields are large
  const answerMap = useMemo(() => {
    const m = new Map<string, Answer>()
    answers.forEach(a => m.set(`${a.response_id}::${a.field_id}`, a))
    return m
  }, [answers])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('realtime_responses')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'responses', filter: `form_id=eq.${formId}` },
        async (payload) => {
          const newResponse = payload.new as Response
          setResponses(prev => [newResponse, ...prev])

          // Answers are inserted right after the response row in the same server action.
          // Wait 600ms so the DB transaction has time to commit before we fetch.
          const fetchAnswers = async (attempt = 0) => {
            await new Promise(r => setTimeout(r, 600))
            const { data: newAnswers } = await supabase
              .from('answers')
              .select('response_id, field_id, value, audio_url, sentiment')
              .eq('response_id', newResponse.id)

            if (newAnswers && newAnswers.length > 0) {
              setAnswers(prev => [...newAnswers, ...prev])
            } else if (attempt < 2) {
              // Retry up to 2 more times in case of slow write
              fetchAnswers(attempt + 1)
            }
          }
          fetchAnswers()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [formId])

  if (responses.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-foreground/10 rounded-2xl bg-foreground/[0.02]">
        <p className="text-foreground/50 text-sm">No one has responded to this form yet.</p>
        <p className="text-foreground/40 text-xs mt-1">Copy your link above and share it!</p>
      </div>
    )
  }

  const calculateAnalytics = () => {
    if (responses.length === 0) return { total: 0, positive: 0, neutral: 0, hesitant: 0, frustrated: 0 }
    
    let pos = 0, neu = 0, hes = 0, frus = 0;
    
    // We try to find the overall sentiment of a response by taking the last non-null sentiment
    responses.forEach(r => {
      const parts = answers.filter(a => a.response_id === r.id && a.sentiment);
      if (parts.length > 0) {
        const primary = parts[parts.length - 1].sentiment
        if (primary === 'positive') pos++;
        else if (primary === 'hesitant') hes++;
        else if (primary === 'frustrated') frus++;
        else neu++;
      } else {
        neu++; // fallback
      }
    })
    
    return { 
      total: responses.length, 
      positive: pos, 
      neutral: neu, 
      hesitant: hes, 
      frustrated: frus 
    }
  }

  const stat = calculateAnalytics()

  return (
    <div className="space-y-8">
      {/* Epic 7: Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-6">
          <p className="text-sm text-foreground/50 font-medium">Total Responses</p>
          <p className="text-3xl font-serif mt-2">{stat.total}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
          <p className="text-sm text-emerald-600/80 font-medium">Positive Tone</p>
          <p className="text-3xl font-serif mt-2 text-emerald-600">{stat.positive}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
          <p className="text-sm text-amber-600/80 font-medium">Hesitant</p>
          <p className="text-3xl font-serif mt-2 text-amber-600">{stat.hesitant}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
          <p className="text-sm text-red-600/80 font-medium">Frustrated</p>
          <p className="text-3xl font-serif mt-2 text-red-600">{stat.frustrated}</p>
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-2xl border border-foreground/10 bg-foreground/[0.02] max-h-[800px] overflow-y-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-foreground/[0.03] text-foreground/60 border-b border-foreground/10 uppercase text-xs tracking-wider sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-4 font-medium">Date</th>
              <th scope="col" className="px-6 py-4 font-medium">Input</th>
              {fields.map(field => (
                <th key={field.id} scope="col" className="px-6 py-4 font-medium max-w-[200px] truncate" title={field.label}>
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {responses.map((response) => (
              <tr key={response.id} className="border-b border-foreground/5 last:border-0 hover:bg-foreground/[0.04] transition-colors">
                <td className="px-6 py-4 text-foreground/70">
                  {new Date(response.submitted_at).toLocaleDateString('en-GB')}
                </td>
                <td className="px-6 py-4">
                  {response.input_method === 'voice' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-sage/10 px-2.5 py-1 text-xs font-medium text-accent-sage ring-1 ring-inset ring-accent-sage/20">
                      <Mic className="h-3 w-3" /> Voice
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/70 ring-1 ring-inset ring-foreground/20">
                      <Keyboard className="h-3 w-3" /> Text
                    </span>
                  )}
                </td>
                {fields.map(field => {
                  const ans = answerMap.get(`${response.id}::${field.id}`)
                  return (
                    <td key={field.id} className="px-6 py-4 max-w-[200px]">
                    {ans ? (() => {
                      const v = ans.value
                      const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v)
                      const isVid = /\.(mp4|mov|webm|ogg)$/i.test(v)
                      const isUrl = v.startsWith('http')
                      if (isImg && isUrl) return (
                        <a href={v} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v} alt="upload" className="h-10 w-10 rounded-lg object-cover border border-foreground/10 hover:opacity-80 transition-opacity" />
                        </a>
                      )
                      if (isVid && isUrl) return (
                        <a href={v} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-amber text-xs hover:opacity-80 transition-opacity">🎬 Video</a>
                      )
                      if (isUrl && !isImg && !isVid) return (
                        <a href={v} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-amber text-xs hover:opacity-80 transition-opacity truncate max-w-[150px]">📎 File</a>
                      )
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-foreground truncate" title={v}>{v}</span>
                          {ans.audio_url && (
                            <MinimalAudioPlayer url={ans.audio_url} />
                          )}
                        </div>
                      )
                    })() : (
                      <span className="text-foreground/30 italic">Skipped</span>
                    )}
                  </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

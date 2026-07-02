'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mic, Keyboard, PlayCircle, PauseCircle, Loader2 } from 'lucide-react'
import { ResponseDrawer } from './ResponseDrawer'
import type { DrawerResponse, DrawerAnswer, DrawerField } from './ResponseDrawer'

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
      audio.oncanplay = () => { setIsLoading(false); audio.play() }
      audio.onplay = () => setIsPlaying(true)
      audio.onpause = () => setIsPlaying(false)
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => { setIsLoading(false); setIsPlaying(false) }
      audioRef.current = audio
      audio.play().catch(() => {})
    } else {
      audioRef.current.play()
    }
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); togglePlay() }}
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

// Only show first 3 fields in the table (rest visible in the drawer)
const MAX_TABLE_FIELDS = 3

export default function ResponsesTable({ formId, fields, initialResponses, initialAnswers }: Props) {
  const [responses, setResponses] = useState<Response[]>(initialResponses)
  const [answers, setAnswers] = useState<Answer[]>(initialAnswers)
  const [drawerResponse, setDrawerResponse] = useState<Response | null>(null)
  const [livePaused, setLivePaused] = useState(false)

  const previewFields = fields.slice(0, MAX_TABLE_FIELDS)
  const hiddenFieldCount = Math.max(0, fields.length - MAX_TABLE_FIELDS)

  // O(1) lookup: "responseId::fieldId" -> Answer
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

          const fetchAnswers = async (attempt = 0) => {
            await new Promise(r => setTimeout(r, 600))
            const { data: newAnswers } = await supabase
              .from('answers')
              .select('response_id, field_id, value, audio_url, sentiment')
              .eq('response_id', newResponse.id)
            if (newAnswers && newAnswers.length > 0) {
              setAnswers(prev => [...newAnswers, ...prev])
            } else if (attempt < 2) {
              fetchAnswers(attempt + 1)
            }
          }
          fetchAnswers()
        }
      )
      .subscribe((status) => {
        // Surface a dead subscription instead of silently missing new rows.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLivePaused(true)
        } else if (status === 'SUBSCRIBED') {
          setLivePaused(false)
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [formId])

  if (responses.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-foreground/10 rounded-2xl bg-foreground/[0.02]">
        <p className="text-foreground/50 text-sm">No responses yet.</p>
        <p className="text-foreground/40 text-xs mt-1">Share your form link to start collecting data.</p>
      </div>
    )
  }

  return (
    <>
      {livePaused && (
        <div className="mb-3 rounded-xl bg-accent-amber/[0.06] border border-accent-amber/15 px-4 py-2.5 text-xs text-accent-amber">
          Live updates paused. Refresh to see the latest responses.
        </div>
      )}
      <div className="relative overflow-x-auto rounded-2xl border border-foreground/10 bg-foreground/[0.02] max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-foreground/[0.03] text-foreground/50 border-b border-foreground/10 uppercase text-xs tracking-wider sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-5 py-4 font-medium">Date</th>
              <th scope="col" className="px-5 py-4 font-medium">Method</th>
              {previewFields.map(field => (
                <th key={field.id} scope="col" className="px-5 py-4 font-medium max-w-[180px] truncate" title={field.label}>
                  {field.label}
                </th>
              ))}
              {hiddenFieldCount > 0 && (
                <th scope="col" className="px-5 py-4 font-medium text-foreground/30">
                  +{hiddenFieldCount} more
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {responses.map((response) => (
              <tr
                key={response.id}
                onClick={() => setDrawerResponse(response)}
                className="border-b border-foreground/5 last:border-0 hover:bg-foreground/[0.04] transition-colors cursor-pointer"
              >
                <td className="px-5 py-3.5 text-foreground/60 text-xs">
                  {new Date(response.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  <br />
                  <span className="text-foreground/40">
                    {new Date(response.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {response.input_method === 'voice' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-sage/10 px-2 py-0.5 text-xs font-medium text-accent-sage ring-1 ring-inset ring-accent-sage/20">
                      <Mic className="h-3 w-3" /> Voice
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/8 px-2 py-0.5 text-xs font-medium text-foreground/60 ring-1 ring-inset ring-foreground/15">
                      <Keyboard className="h-3 w-3" /> Text
                    </span>
                  )}
                </td>
                {previewFields.map(field => {
                  const ans = answerMap.get(`${response.id}::${field.id}`)
                  return (
                    <td key={field.id} className="px-5 py-3.5 max-w-[180px]">
                      {ans?.value ? (() => {
                        const v = ans.value
                        const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(v)
                        const isUrl = v.startsWith('http')
                        if (isImg && isUrl) return (
                          <a href={v} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={v} alt="upload" className="h-8 w-8 rounded object-cover border border-foreground/10" />
                          </a>
                        )
                        if (isUrl) return <span className="text-foreground/40 text-xs">📎 File</span>
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground truncate max-w-[120px]" title={v}>{v}</span>
                            {ans.audio_url && <MinimalAudioPlayer url={ans.audio_url} />}
                          </div>
                        )
                      })() : (
                        <span className="text-foreground/25 italic text-xs">—</span>
                      )}
                    </td>
                  )
                })}
                {hiddenFieldCount > 0 && (
                  <td className="px-5 py-3.5 text-foreground/30 text-xs">Click to view</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResponseDrawer
        response={drawerResponse}
        fields={fields as DrawerField[]}
        answers={answers as DrawerAnswer[]}
        onClose={() => setDrawerResponse(null)}
      />
    </>
  )
}

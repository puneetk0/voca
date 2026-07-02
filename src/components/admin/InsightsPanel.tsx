'use client'

import { useRef, useState, useEffect } from 'react'
import { Mic, Keyboard, PlayCircle, PauseCircle, Loader2 } from 'lucide-react'
import { FieldBarChart } from './charts/FieldBarChart'
import { formatDuration } from './SummaryPanel'
import type { FieldInsight, SessionAnalytics } from './insights'

interface Props {
  fieldInsights: FieldInsight[]
  session: SessionAnalytics | null
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive:   'text-accent-sage',
  neutral:    'text-foreground/50',
  hesitant:   'text-accent-amber',
  frustrated: 'text-accent-rose',
}

function MiniAudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { ref.current?.pause() }, [])
  function toggle() {
    if (playing && ref.current) { ref.current.pause(); setPlaying(false); return }
    if (!ref.current) {
      setLoading(true)
      const a = new Audio(url)
      a.oncanplay = () => { setLoading(false); a.play() }
      a.onplay = () => setPlaying(true)
      a.onpause = () => setPlaying(false)
      a.onended = () => setPlaying(false)
      a.onerror = () => { setLoading(false); setPlaying(false) }
      ref.current = a
      a.play().catch(() => {})
    } else {
      ref.current.play()
    }
  }
  return (
    <button onClick={toggle} disabled={loading} className="shrink-0 text-accent-sage hover:opacity-70 transition-opacity">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
    </button>
  )
}

/** Horizontal breakdown bars for device / browser splits. */
function BreakdownBars({ items }: { items: { name: string; count: number }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0)
  if (total === 0) return <p className="text-xs text-foreground/30 italic">No data yet</p>
  return (
    <div className="space-y-2.5">
      {items.map(item => {
        const pct = Math.round((item.count / total) * 100)
        return (
          <div key={item.name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-foreground/70 capitalize">{item.name || 'unknown'}</span>
              <span className="text-foreground/40 tabular-nums">{item.count} · {pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-foreground/8 rounded-full overflow-hidden">
              <div className="h-full bg-accent-sage rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function InsightsPanel({ fieldInsights, session }: Props) {
  const hasSession = session !== null && session.startedCount > 0

  return (
    <div className="space-y-6">
      {/* ── Session analytics: drop-off, timing, device ── */}
      {hasSession && (
        <div className="space-y-3">
          {/* Timing + starts strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-3">Starts</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{session!.startedCount}</p>
            </div>
            <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-3">Completed</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{session!.completedCount}</p>
            </div>
            <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-3">Avg time</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{formatDuration(session!.avgDurationMs)}</p>
            </div>
            <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-3">Median time</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{formatDuration(session!.medianDurationMs)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Drop-off funnel */}
            <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-4">Drop-off by question</p>
              {session!.funnel.length > 0 ? (
                <div className="space-y-2.5">
                  {session!.funnel.map(step => {
                    const pct = session!.startedCount > 0 ? Math.round((step.reached / session!.startedCount) * 100) : 0
                    return (
                      <div key={step.index}>
                        <div className="flex items-center justify-between text-xs mb-1 gap-2">
                          <span className="text-foreground/70 truncate">{step.index + 1}. {step.label}</span>
                          <span className="text-foreground/40 tabular-nums shrink-0">{step.reached} · {pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-foreground/8 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-amber rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-foreground/30 italic">No session data yet</p>
              )}
            </div>

            {/* Device + browser */}
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-4">Device</p>
                <BreakdownBars items={session!.devices} />
              </div>
              <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-4">Browser</p>
                <BreakdownBars items={session!.browsers} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Per-field insights ── */}
      {fieldInsights.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide mb-3">Field insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fieldInsights.map(insight => (
              <div key={insight.fieldId} className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-foreground truncate max-w-[75%]">{insight.label}</p>
                  <span className="text-xs text-foreground/40 tabular-nums shrink-0 ml-2">
                    {insight.total} answered{insight.skipped > 0 ? ` · ${insight.skipped} skipped` : ''}
                  </span>
                </div>

                {insight.type === 'mcq' && (
                  insight.total > 0
                    ? <FieldBarChart options={insight.options} counts={insight.counts} total={insight.total} />
                    : <p className="text-xs text-foreground/30 italic">No answers yet</p>
                )}

                {insight.type === 'text' && (
                  insight.recentAnswers.length > 0 ? (
                    <div className="space-y-2">
                      {insight.recentAnswers.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 group">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground line-clamp-2">{a.value}</p>
                            {a.sentiment && (
                              <p className={`text-xs mt-0.5 ${SENTIMENT_COLOR[a.sentiment] ?? 'text-foreground/40'}`}>
                                {a.sentiment}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {a.inputMethod === 'voice' ? (
                              <Mic className="h-3 w-3 text-accent-sage" />
                            ) : (
                              <Keyboard className="h-3 w-3 text-foreground/30" />
                            )}
                            {a.audioUrl && <MiniAudioPlayer url={a.audioUrl} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/30 italic">No answers yet</p>
                  )
                )}

                {insight.type === 'file' && (
                  insight.files.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {insight.files.slice(0, 6).map((url, i) => {
                        const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
                        return isImg ? (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover border border-foreground/10 hover:opacity-80 transition-opacity" />
                          </a>
                        ) : (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="h-14 w-14 rounded-lg border border-foreground/10 flex items-center justify-center text-lg hover:bg-foreground/5 transition-colors">
                            📎
                          </a>
                        )
                      })}
                      {insight.files.length > 6 && (
                        <div className="h-14 w-14 rounded-lg border border-foreground/10 flex items-center justify-center text-xs text-foreground/40">
                          +{insight.files.length - 6}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/30 italic">No uploads yet</p>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        !hasSession && (
          <div className="text-center py-16 border border-dashed border-foreground/15 rounded-2xl">
            <p className="text-sm text-foreground/50">Insights will appear here once responses come in.</p>
          </div>
        )
      )}
    </div>
  )
}

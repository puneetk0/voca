'use client'

import { TrendChart } from './charts/TrendChart'
import { MethodDonut } from './charts/MethodDonut'
import type { SessionAnalytics } from './insights'

interface Props {
  totalResponses: number
  voiceCount: number
  textCount: number
  moodLabel: string
  avgFieldsAnswered: number
  totalFields: number
  trendData: { date: string; count: number }[]
  session: SessionAnalytics | null
}

const MOOD_STYLE: Record<string, { dot: string; text: string }> = {
  Positive:   { dot: 'bg-accent-sage',   text: 'text-accent-sage' },
  Neutral:    { dot: 'bg-foreground/30', text: 'text-foreground/60' },
  Hesitant:   { dot: 'bg-accent-amber',  text: 'text-accent-amber' },
  Frustrated: { dot: 'bg-accent-rose',   text: 'text-accent-rose' },
  'N/A':      { dot: 'bg-foreground/20', text: 'text-foreground/40' },
}

export function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-3">{label}</p>
      {children}
    </div>
  )
}

/** Format a duration in ms into a compact human string (e.g. "1m 24s"). */
export function formatDuration(ms: number | null): string {
  if (ms === null || !isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function SummaryPanel({
  totalResponses,
  voiceCount,
  textCount,
  moodLabel,
  avgFieldsAnswered,
  totalFields,
  trendData,
  session,
}: Props) {
  const voicePct = totalResponses > 0 ? Math.round((voiceCount / totalResponses) * 100) : 0
  const completionPct = totalFields > 0 ? Math.round((avgFieldsAnswered / totalFields) * 100) : 0
  const moodStyle = MOOD_STYLE[moodLabel] ?? MOOD_STYLE['N/A']
  const dropOffPct = session && session.startedCount > 0 ? Math.round(session.dropOffRate * 100) : null

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Responses">
          <p className="text-4xl font-bold tabular-nums tracking-tight">{totalResponses}</p>
          <p className="text-xs text-foreground/40 mt-1">total submissions</p>
        </KpiCard>

        <KpiCard label="Input method">
          <p className="text-4xl font-bold tabular-nums tracking-tight">{voicePct}<span className="text-xl font-semibold text-foreground/40">%</span></p>
          <p className="text-xs text-foreground/40 mt-1">voice · {voiceCount}v {textCount}t</p>
        </KpiCard>

        <KpiCard label="Overall mood">
          {moodLabel === 'N/A' ? (
            <>
              <p className="text-2xl font-bold text-foreground/30 mt-1">—</p>
              <p className="text-xs text-foreground/30 mt-1">no sentiment data</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mt-1">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${moodStyle.dot}`} />
                <span className={`text-2xl font-bold ${moodStyle.text}`}>{moodLabel}</span>
              </div>
              <p className="text-xs text-foreground/40 mt-1">from answer sentiment</p>
            </>
          )}
        </KpiCard>

        {/* Drop-off replaces the old Completion card when session data exists */}
        {dropOffPct !== null ? (
          <KpiCard label="Drop-off">
            <p className="text-4xl font-bold tabular-nums tracking-tight">
              {dropOffPct}<span className="text-xl font-semibold text-foreground/40">%</span>
            </p>
            <p className="text-xs text-foreground/40 mt-1">{session!.completedCount}/{session!.startedCount} finished</p>
          </KpiCard>
        ) : (
          <KpiCard label="Completion">
            <p className="text-4xl font-bold tabular-nums tracking-tight">
              {completionPct}<span className="text-xl font-semibold text-foreground/40">%</span>
            </p>
            <p className="text-xs text-foreground/40 mt-1">{avgFieldsAnswered.toFixed(1)} / {totalFields} fields avg</p>
          </KpiCard>
        )}
      </div>

      {/* Charts row */}
      {totalResponses > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-4">Response trend — last 30 days</p>
            <TrendChart data={trendData} />
          </div>
          <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-2">Voice vs text</p>
            <MethodDonut voiceCount={voiceCount} textCount={textCount} />
          </div>
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-foreground/15 rounded-2xl">
          <p className="text-sm text-foreground/50">No responses yet — share your form to start collecting.</p>
        </div>
      )}
    </div>
  )
}

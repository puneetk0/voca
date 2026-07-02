'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Stethoscope, XCircle } from 'lucide-react'
import Link from 'next/link'
import { checkFormHealth, type FormHealthReport } from '@/lib/actions/health'

interface Props {
  formId: string
  /** Presence-only facts known at render time (no live validation) */
  hasAiKeys: boolean
  hasFields: boolean
}

export default function FormHealthBanner({ formId, hasAiKeys, hasFields }: Props) {
  const [checking, setChecking] = useState(false)
  const [report, setReport] = useState<FormHealthReport | null>(null)

  const cacheKey = `voca_health_${formId}`

  // Live checks burn provider quota — reuse this session's result if present.
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) setReport(JSON.parse(cached))
    } catch { }
  }, [cacheKey])

  async function runCheck() {
    setChecking(true)
    try {
      const result = await checkFormHealth(formId)
      setReport(result)
      try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch { }
    } finally {
      setChecking(false)
    }
  }

  const staticProblems: string[] = []
  if (!hasAiKeys) staticProblems.push('No AI keys configured. Respondents cannot start a conversation.')
  if (!hasFields) staticProblems.push('This form has no questions yet.')

  // Nothing known to be wrong and no report requested → just the quiet check button.
  if (staticProblems.length === 0 && !report) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          onClick={runCheck}
          disabled={checking}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
          Run health check
        </button>
      </div>
    )
  }

  const rows = report && !report.error
    ? [
        { ok: report.llmOk, label: 'Conversation AI', detail: report.llmDetail },
        { ok: report.ttsOk, label: 'Voice', detail: report.ttsDetail },
        { ok: report.hasFields, label: 'Questions', detail: report.hasFields ? 'Fields configured' : 'No questions added yet' },
        { ok: report.isActive, label: 'Status', detail: report.isActive ? 'Form is live' : 'Form is paused' },
      ]
    : null

  const allOk = rows ? rows.every(r => r.ok) : false

  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 ${
      staticProblems.length > 0 || (rows && !allOk)
        ? 'border-accent-amber/25 bg-accent-amber/[0.05]'
        : 'border-accent-sage/25 bg-accent-sage/[0.05]'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          {staticProblems.map(p => (
            <p key={p} className="flex items-center gap-2 text-sm text-foreground/80">
              <AlertTriangle className="h-4 w-4 shrink-0 text-accent-amber" />
              {p}
              {!hasAiKeys && (
                <Link href="/admin/settings" className="shrink-0 text-accent-amber underline underline-offset-2 hover:opacity-80">
                  Fix in Settings
                </Link>
              )}
            </p>
          ))}

          {report?.error && (
            <p className="flex items-center gap-2 text-sm text-foreground/80">
              <XCircle className="h-4 w-4 shrink-0 text-red-500" /> {report.error}
            </p>
          )}

          {rows && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {rows.map(r => (
                <p key={r.label} className="flex items-center gap-2 text-sm">
                  {r.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-sage" />
                    : <XCircle className="h-4 w-4 shrink-0 text-accent-amber" />}
                  <span className="font-medium text-foreground">{r.label}</span>
                  <span className="truncate text-foreground/50">{r.detail}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={runCheck}
          disabled={checking}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/15 px-3.5 py-1.5 text-xs font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
          {report ? 'Re-check' : 'Run health check'}
        </button>
      </div>
    </div>
  )
}

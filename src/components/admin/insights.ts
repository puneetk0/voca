// Shared analytics types for the form dashboard.
// Kept dependency-free so the server page (page.tsx) can import them too.

export type MCQInsight = {
  fieldId: string; label: string; type: 'mcq'
  options: string[]; counts: Record<string, number>; total: number; skipped: number
}
export type TextInsight = {
  fieldId: string; label: string; type: 'text'
  recentAnswers: { value: string; audioUrl: string | null; sentiment: string | null; inputMethod: string }[]
  total: number; skipped: number
}
export type FileInsight = {
  fieldId: string; label: string; type: 'file'
  files: string[]; total: number; skipped: number
}
export type FieldInsight = MCQInsight | TextInsight | FileInsight

// Session-derived analytics (drop-off, timing, device) — computed in page.tsx.
export type FunnelStep = { index: number; label: string; reached: number }
export type NameCount = { name: string; count: number }

export type SessionAnalytics = {
  startedCount: number
  completedCount: number
  dropOffRate: number            // 0–1, share of starts that never completed
  avgDurationMs: number | null   // over completed sessions
  medianDurationMs: number | null
  funnel: FunnelStep[]           // how many sessions reached each field index
  branched?: boolean             // form has routing rules — some skips are intentional
  devices: NameCount[]           // device_type breakdown
  browsers: NameCount[]          // browser breakdown
}

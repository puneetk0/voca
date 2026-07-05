import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NewFormBanner } from '@/components/admin/NewFormBanner'
import { FormHeader } from '@/components/admin/FormHeader'
import FormHealthBanner from '@/components/admin/FormHealthBanner'
import DashboardTabs from '@/components/admin/DashboardTabs'
import { getFormHealth } from '@/lib/actions/health'
import { ArrowLeft } from 'lucide-react'
import type { FieldInsight, SessionAnalytics } from '@/components/admin/insights'
import { hasBranching } from '@/lib/branching'

export default async function FormDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { id } = await params
  const search = await searchParams
  const isNew = search?.new === '1'
  const validTabs = ['summary', 'results', 'insights', 'settings'] as const
  const initialTab = (validTabs as readonly string[]).includes(search?.tab) ? (search.tab as typeof validTabs[number]) : 'summary'

  const hdrs = await headers()
  const host = hdrs.get('host') ?? 'localhost:3000'
  const proto = hdrs.get('x-forwarded-proto') ?? 'http'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`

  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single()

  if (formError || form.user_id !== user?.id) redirect('/admin')

  const { data: fields } = await supabase
    .from('fields')
    .select('*')
    .eq('form_id', id)
    .order('order_index')

  const RESPONSE_LIMIT = 200
  const { data: responses } = await supabase
    .from('responses')
    .select('id, input_method, submitted_at')
    .eq('form_id', id)
    .order('submitted_at', { ascending: false })
    .limit(RESPONSE_LIMIT)

  const responseIds = responses?.map(r => r.id) ?? []
  const { data: _answers } = responseIds.length > 0
    ? await supabase
        .from('answers')
        .select('response_id, field_id, value, audio_url, sentiment')
        .in('response_id', responseIds)
    : { data: [] }

  const isLimited = (responses?.length ?? 0) === RESPONSE_LIMIT
  const allResponses = responses ?? []
  const answers = _answers ?? []
  const allFields = fields ?? []

  // ── Analytics computations (server-side) ──

  // Trend: last 30 days
  const trendData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const isoDate = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      date: label,
      count: allResponses.filter(r => r.submitted_at.slice(0, 10) === isoDate).length,
    }
  })

  // Voice vs text
  const voiceCount = allResponses.filter(r => r.input_method === 'voice').length
  const textCount = allResponses.length - voiceCount

  // Overall mood (average sentiment score across all answers)
  const SENTIMENT_SCORE: Record<string, number> = { positive: 4, neutral: 3, hesitant: 2, frustrated: 1 }
  const scoredAnswers = answers.filter(a => a.sentiment && SENTIMENT_SCORE[a.sentiment])
  const avgMoodScore = scoredAnswers.length > 0
    ? scoredAnswers.reduce((s, a) => s + SENTIMENT_SCORE[a.sentiment!], 0) / scoredAnswers.length
    : null
  const moodLabel = avgMoodScore === null
    ? 'N/A'
    : avgMoodScore >= 3.5 ? 'Positive'
    : avgMoodScore >= 2.5 ? 'Neutral'
    : avgMoodScore >= 1.5 ? 'Hesitant'
    : 'Frustrated'

  // Average fields answered per response
  const avgFieldsAnswered = allResponses.length > 0
    ? Math.round((answers.filter(a => a.value).length / allResponses.length) * 10) / 10
    : 0

  // Per-field insights
  // Build a map from response_id → input_method for audio answer attribution
  const responseMethodMap = new Map(allResponses.map(r => [r.id, r.input_method]))

  const fieldInsights: FieldInsight[] = allFields.map(field => {
    const fieldAnswers = answers.filter(a => a.field_id === field.id && a.value)
    const skipped = allResponses.length - fieldAnswers.length

    const ft = field.field_type as string

    if (ft === 'mcq' || ft === 'multiple_choice' || ft === 'multi_select') {
      const rawOptions: string[] = Array.isArray(field.options) ? field.options : []
      const counts: Record<string, number> = {}
      rawOptions.forEach((o: string) => { counts[o] = 0 })
      fieldAnswers.forEach(a => {
        const vals = ft === 'multi_select' ? String(a.value).split(',').map(v => v.trim()) : [a.value]
        vals.forEach(v => { counts[v] = (counts[v] ?? 0) + 1 })
      })
      return { fieldId: field.id, label: field.label, type: 'mcq', options: rawOptions, counts, total: fieldAnswers.length, skipped }
    }

    if (ft === 'file' || ft === 'upload') {
      return {
        fieldId: field.id,
        label: field.label,
        type: 'file',
        files: fieldAnswers.map(a => a.value).filter(v => v.startsWith('http')),
        total: fieldAnswers.length,
        skipped,
      }
    }

    // Text, textarea, email, phone, number, etc.
    return {
      fieldId: field.id,
      label: field.label,
      type: 'text',
      recentAnswers: fieldAnswers.slice(0, 5).map(a => ({
        value: a.value,
        audioUrl: a.audio_url ?? null,
        sentiment: a.sentiment ?? null,
        inputMethod: responseMethodMap.get(a.response_id) ?? 'text',
      })),
      total: fieldAnswers.length,
      skipped,
    }
  })

  // ── Session analytics: drop-off, completion time, device/browser ──
  const { data: sessionRows } = await supabase
    .from('form_sessions')
    .select('completed_at, duration_ms, last_field_index, device_type, browser')
    .eq('form_id', id)
    .limit(5000)

  const tallyBy = (rows: any[], get: (r: any) => string | null) => {
    const m = new Map<string, number>()
    rows.forEach(r => { const k = (get(r) || 'unknown'); m.set(k, (m.get(k) ?? 0) + 1) })
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }

  let session: SessionAnalytics | null = null
  const sessions = sessionRows ?? []
  if (sessions.length > 0) {
    const startedCount = sessions.length
    const completed = sessions.filter(s => s.completed_at)
    const completedCount = completed.length
    const durations = completed
      .map(s => s.duration_ms)
      .filter((d): d is number => typeof d === 'number' && d > 0)
      .sort((a, b) => a - b)
    const avgDurationMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
    const medianDurationMs = durations.length ? durations[Math.floor((durations.length - 1) / 2)] : null
    const funnel = allFields.map((f, k) => ({
      index: k,
      label: f.label,
      reached: sessions.filter(s => s.completed_at || (typeof s.last_field_index === 'number' && s.last_field_index >= k)).length,
    }))
    session = {
      startedCount,
      completedCount,
      dropOffRate: startedCount > 0 ? 1 - completedCount / startedCount : 0,
      avgDurationMs,
      medianDurationMs,
      funnel,
      branched: hasBranching(allFields),
      devices: tallyBy(sessions, s => s.device_type),
      browsers: tallyBy(sessions, s => s.browser),
    }
  }

  return (
    <main className="max-w-6xl mx-auto py-10 px-6">
      <Link
        href="/admin"
        className="text-sm font-medium text-foreground/40 hover:text-foreground flex items-center gap-2 mb-8 transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> All forms
      </Link>

      {isNew && <NewFormBanner slug={form.slug} formId={form.id} appUrl={appUrl} />}

      <FormHeader
        formTitle={form.title}
        formDescription={form.description}
        isActive={form.is_active}
        slug={form.slug}
        formId={form.id}
        appUrl={appUrl}
      />

      <FormHealthBanner
        formId={form.id}
        hasAiKeys={(await getFormHealth(form.user_id)).hasAiKeys}
        hasFields={allFields.length > 0}
      />

      <DashboardTabs
        initialTab={initialTab}
        summary={{
          totalResponses: allResponses.length,
          voiceCount,
          textCount,
          moodLabel,
          avgFieldsAnswered,
          totalFields: allFields.length,
          trendData,
        }}
        session={session}
        fieldInsights={fieldInsights}
        results={{
          formId: form.id,
          fields: allFields,
          initialResponses: allResponses,
          initialAnswers: answers,
          totalCount: allResponses.length,
          isLimited,
        }}
        settings={{
          formId: form.id,
          formTitle: form.title,
          slug: form.slug,
          isActive: form.is_active,
          redirectUrl: form.redirect_url ?? null,
          emailNotifications: form.email_notifications ?? true,
          appUrl,
          hasResponses: allResponses.length > 0,
        }}
      />
    </main>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Link2, CheckCircle2, Loader2, ExternalLink, Bell, BellOff,
  PauseCircle, PlayCircle, Download, Trash2, Pencil,
} from 'lucide-react'
import { updateFormSlug, updateFormSettings, toggleFormStatus, deleteForm } from '@/lib/actions/forms'
import { exportFormCSV } from '@/lib/actions/export'

interface Props {
  formId: string
  formTitle: string
  slug: string | null
  isActive: boolean
  redirectUrl: string | null
  emailNotifications: boolean
  appUrl: string
  hasResponses: boolean
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="text-xs text-foreground/50 mt-1 mb-4">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </div>
  )
}

export default function SettingsPanel({
  formId, formTitle, slug, isActive, redirectUrl, emailNotifications, appUrl, hasResponses,
}: Props) {
  const router = useRouter()

  // Slug
  const [slugValue, setSlugValue] = useState(slug ?? '')
  const [slugLoading, setSlugLoading] = useState(false)
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Redirect
  const [redirect, setRedirect] = useState(redirectUrl ?? '')
  const [redirectLoading, setRedirectLoading] = useState(false)
  const [redirectMsg, setRedirectMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Email toggle
  const [emailOn, setEmailOn] = useState(emailNotifications)
  const [emailSaving, setEmailSaving] = useState(false)

  // Status + delete + export
  const [active, setActive] = useState(isActive)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const shareUrl = `${appUrl}/f/${slugValue || formId}`

  async function handleSaveSlug() {
    if (!slugValue.trim()) return
    setSlugLoading(true); setSlugMsg(null)
    const res = await updateFormSlug(formId, slugValue.trim())
    setSlugLoading(false)
    if (res?.error) setSlugMsg({ ok: false, text: res.error })
    else { setSlugValue(res.slug ?? slugValue); setSlugMsg({ ok: true, text: 'URL updated' }) }
  }

  async function handleSaveRedirect() {
    setRedirectLoading(true); setRedirectMsg(null)
    const res = await updateFormSettings(formId, { redirect_url: redirect })
    setRedirectLoading(false)
    if (res?.error) setRedirectMsg({ ok: false, text: res.error })
    else { setRedirect(res.redirect_url ?? ''); setRedirectMsg({ ok: true, text: 'Saved' }) }
  }

  async function handleToggleEmail() {
    const next = !emailOn
    setEmailOn(next); setEmailSaving(true)
    const res = await updateFormSettings(formId, { email_notifications: next })
    setEmailSaving(false)
    if (res?.error) setEmailOn(!next) // revert on failure
  }

  async function handleToggleStatus() {
    setToggling(true)
    await toggleFormStatus(formId, !active)
    setActive(prev => !prev)
    setToggling(false)
  }

  async function handleExport() {
    if (!hasResponses) return
    setExporting(true)
    try {
      const csv = await exportFormCSV(formId, formTitle)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${formTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-responses.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this form? All responses will be permanently deleted and cannot be recovered.')) return
    setDeleting(true)
    await deleteForm(formId)
    router.push('/admin')
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Edit form */}
      <Section title="Form content" description="Edit the title, description, and questions.">
        <button
          onClick={() => router.push(`/admin/forms/${formId}/edit`)}
          className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.09] border border-foreground/10 px-5 py-2.5 text-sm font-medium transition-colors"
        >
          <Pencil className="h-4 w-4" /> Edit form
        </button>
      </Section>

      {/* URL slug */}
      <Section title="Form URL" description="Customize the public link people use to fill out this form.">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 bg-background border border-foreground/15 rounded-xl px-3 py-2 focus-within:border-accent-amber/50 transition-colors min-w-0">
            <span className="text-sm text-foreground/40 shrink-0">/f/</span>
            <input
              value={slugValue}
              onChange={e => { setSlugValue(e.target.value); setSlugMsg(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveSlug() }}
              placeholder={formId.slice(0, 8)}
              className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            />
          </div>
          <button
            onClick={handleSaveSlug}
            disabled={slugLoading || !slugValue.trim()}
            className="shrink-0 flex items-center gap-1.5 rounded-full bg-accent-amber px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {slugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-foreground/40">
          <Link2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{shareUrl}</span>
        </div>
        {slugMsg && <p className={`text-xs mt-2 ${slugMsg.ok ? 'text-accent-sage' : 'text-red-500'}`}>{slugMsg.text}</p>}
      </Section>

      {/* Redirect */}
      <Section title="After submission" description="Optionally send respondents to your own page once they finish.">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 bg-background border border-foreground/15 rounded-xl px-3 py-2 focus-within:border-accent-amber/50 transition-colors min-w-0">
            <ExternalLink className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
            <input
              value={redirect}
              onChange={e => { setRedirect(e.target.value); setRedirectMsg(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveRedirect() }}
              placeholder="https://yoursite.com/thank-you"
              className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            />
          </div>
          <button
            onClick={handleSaveRedirect}
            disabled={redirectLoading}
            className="shrink-0 flex items-center gap-1.5 rounded-full bg-accent-amber px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {redirectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
        <p className="text-xs text-foreground/40 mt-2">Leave empty to show Voca&apos;s built-in confirmation screen.</p>
        {redirectMsg && <p className={`text-xs mt-2 ${redirectMsg.ok ? 'text-accent-sage' : 'text-red-500'}`}>{redirectMsg.text}</p>}
      </Section>

      {/* Email notifications */}
      <Section title="Notifications">
        <button
          onClick={handleToggleEmail}
          disabled={emailSaving}
          className="w-full flex items-center justify-between gap-3 disabled:opacity-60"
        >
          <div className="flex items-center gap-3 text-left">
            {emailOn ? <Bell className="h-4 w-4 text-accent-sage" /> : <BellOff className="h-4 w-4 text-foreground/40" />}
            <div>
              <p className="text-sm font-medium text-foreground">Email me on new responses</p>
              <p className="text-xs text-foreground/50">Get an email each time someone submits this form.</p>
            </div>
          </div>
          <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${emailOn ? 'bg-accent-sage' : 'bg-foreground/15'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailOn ? 'translate-x-6' : 'translate-x-1'}`} />
          </span>
        </button>
      </Section>

      {/* Status + data */}
      <Section title="Form status">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleToggleStatus}
            disabled={toggling}
            className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.09] border border-foreground/10 px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {active ? 'Pause form' : 'Activate form'}
          </button>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
            active ? 'bg-accent-sage/10 text-accent-sage ring-accent-sage/20' : 'bg-foreground/8 text-foreground/40 ring-foreground/10'
          }`}>
            {active ? 'Active' : 'Paused'}
          </span>

          <button
            onClick={handleExport}
            disabled={exporting || !hasResponses}
            className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.09] border border-foreground/10 px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {hasResponses ? 'Export CSV' : 'Export CSV (no data)'}
          </button>
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-2 rounded-full bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-500 px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete form
        </button>
        <p className="text-xs text-foreground/40 mt-2">Permanently deletes this form and all its responses.</p>
      </Section>
    </div>
  )
}

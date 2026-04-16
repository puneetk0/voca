'use client'

import { useState } from 'react'
import { updateFormSlug } from '@/lib/actions/forms'
import { CheckCircle2, Loader2, Edit2, Link2 } from 'lucide-react'

export function SlugEditor({ formId, initialSlug }: { formId: string; initialSlug?: string | null }) {
  const [slug, setSlug] = useState(initialSlug ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/f/${slug || formId}`
    : `/f/${slug || formId}`

  async function handleSave() {
    if (!slug.trim()) return
    setLoading(true)
    setError('')
    setSuccess(false)
    const res = await updateFormSlug(formId, slug)
    setLoading(false)
    if (res?.error) {
      setError(res.error)
    } else {
      setSlug(res.slug ?? slug)
      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-foreground/40">Share URL</p>
      {!isEditing ? (
        <div className="flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl px-4 py-3">
          <Link2 className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
          <span className="text-sm text-foreground/70 truncate flex-1">/f/{slug || formId}</span>
          {success && <CheckCircle2 className="h-4 w-4 text-accent-sage shrink-0" />}
          <button
            onClick={() => setIsEditing(true)}
            className="shrink-0 text-foreground/40 hover:text-foreground transition-colors"
            title="Edit vanity slug"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl px-4 py-2 focus-within:border-accent-amber/50 transition-colors">
            <span className="text-sm text-foreground/40 shrink-0">/f/</span>
            <input
              autoFocus
              value={slug}
              onChange={e => { setSlug(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false) }}
              placeholder={formId}
              className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-500 px-1">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={loading || !slug.trim()}
              className="flex items-center gap-1.5 text-xs font-semibold bg-accent-amber text-black px-4 py-1.5 rounded-full disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Save
            </button>
            <button onClick={() => { setIsEditing(false); setError('') }} className="text-xs text-foreground/50 hover:text-foreground transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Copy, Check, Eye } from 'lucide-react'

interface Props {
  formTitle: string
  formDescription?: string | null
  isActive: boolean
  slug: string | null
  formId: string
  appUrl: string
}

export function FormHeader({ formTitle, formDescription, isActive, slug, formId, appUrl }: Props) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${appUrl}/f/${slug || formId}`

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Title + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{formTitle}</h1>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              isActive
                ? 'bg-accent-sage/10 text-accent-sage ring-accent-sage/20'
                : 'bg-foreground/8 text-foreground/40 ring-foreground/10'
            }`}>
              {isActive ? 'Active' : 'Paused'}
            </span>
          </div>
          {formDescription && (
            <p className="text-sm text-foreground/50 line-clamp-2 max-w-xl">{formDescription}</p>
          )}
        </div>

        {/* Preview + Share */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/f/${slug || formId}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <Eye className="h-4 w-4" />
            Preview
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-full bg-accent-amber px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Share form'}
          </button>
        </div>
      </div>
    </div>
  )
}

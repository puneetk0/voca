'use client'

import { useState, useEffect } from 'react'
import { Link as LinkIcon, CheckCircle2 } from 'lucide-react'

export function CopyLinkButton({ formId }: { formId: string }) {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const shareLink = origin ? `${origin}/f/${formId}` : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy', e)
    }
  }

  return (
    <div className="flex items-center gap-3 bg-foreground/[0.03] p-2 pr-4 rounded-full border border-foreground/10 w-fit">
      <div className="bg-foreground/5 p-2 rounded-full text-foreground/50">
        <LinkIcon className="h-4 w-4" />
      </div>
      <span className="text-sm font-mono text-foreground/70 truncate max-w-[200px] sm:max-w-xs select-all">
        {shareLink || `/f/${formId}`}
      </span>
      <button 
        onClick={handleCopy}
        className="ml-2 text-sm font-semibold text-accent-amber hover:text-accent-amber/80 transition-colors flex items-center gap-1"
      >
        {copied ? (
          <><CheckCircle2 className="h-4 w-4" /> Copied</>
        ) : (
          'Copy'
        )}
      </button>
    </div>
  )
}

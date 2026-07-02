'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Copy, X } from 'lucide-react'

export function NewFormBanner({ slug, formId, appUrl }: { slug: string | null; formId: string; appUrl: string }) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareId = slug || formId
  const shareUrl = `${appUrl}/f/${shareId}`

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 rounded-2xl bg-accent-sage/10 border border-accent-sage/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-accent-sage/20 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-accent-sage" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Your form is live!</p>
              <p className="text-xs text-foreground/50 mt-0.5">Share this link and start collecting responses.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-background/60 border border-foreground/10 rounded-full px-4 py-2 min-w-0">
              <span className="text-xs text-foreground/60 truncate max-w-[200px]">{shareUrl}</span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 shrink-0 rounded-full bg-accent-sage px-4 py-2 text-xs font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 text-foreground/30 hover:text-foreground/60 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

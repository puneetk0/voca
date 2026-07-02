'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ExternalLink, Loader2 } from 'lucide-react'

/** One-shot confetti burst — pure framer-motion, no dependency, honors reduced-motion. */
function Confetti() {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 480,
        delay: Math.random() * 0.25,
        duration: 1.6 + Math.random() * 1.2,
        rotate: (Math.random() - 0.5) * 720,
        size: 6 + Math.random() * 6,
        color: ['#e08600', '#84cc16', '#e11d48', '#4f46e5', '#f59e0b'][i % 5],
        shape: i % 3 === 0 ? '50%' : '2px',
      })),
    [],
  )
  if (reduce) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center overflow-hidden h-[70vh]">
      {pieces.map(p => (
        <motion.span
          key={p.id}
          initial={{ y: -20, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '70vh', x: p.x, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{ width: p.size, height: p.size, backgroundColor: p.color, borderRadius: p.shape }}
          className="absolute top-0"
        />
      ))}
    </div>
  )
}

export default function SuccessScreen({
  form,
  fields,
  answers,
  submissionId,
  submissionTime,
  redirectUrl,
}: {
  form: { title: string }
  fields: Array<{ id: string; label: string; field_type: string }>
  answers: Record<string, string>
  submissionId?: string | null
  submissionTime?: string | null
  redirectUrl?: string | null
}) {
  // If the form owner configured a post-submit redirect, bounce there after a
  // short confirmation beat so the responder sees their answer landed.
  useEffect(() => {
    if (!redirectUrl) return
    const t = setTimeout(() => { window.location.href = redirectUrl }, 1600)
    return () => clearTimeout(t)
  }, [redirectUrl])

  const nameField = fields.find(f =>
    f.label.toLowerCase().includes('name') && f.field_type === 'text'
  )
  const userName = nameField ? answers[nameField.id] : null

  const keyField = fields.find(f =>
    f.id !== nameField?.id &&
    f.field_type !== 'email' &&
    f.field_type !== 'file' &&
    answers[f.id]
  )
  const keyValue = keyField ? answers[keyField.id] : null

  // Minimal confirmation while redirecting to the owner's page.
  if (redirectUrl) {
    return (
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="min-h-[100dvh] flex flex-col items-center justify-center p-8 bg-background text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight mb-3 text-foreground">
          {userName ? `All set, ${userName.split(' ')[0]}.` : 'All done!'}
        </h2>
        <p className="flex items-center gap-2 text-foreground/50 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Redirecting you now…
        </p>
      </motion.main>
    )
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.0, ease: 'easeOut' }}
      className="min-h-[100dvh] flex flex-col items-center justify-center p-8 bg-background"
    >
      <Confetti />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7 }}
        className="text-center max-w-md w-full"
      >
        <h2 className="text-4xl font-semibold tracking-tight mb-3 text-foreground">
          {userName ? `All set, ${userName.split(' ')[0]}.` : 'All done!'}
        </h2>

        <p className="text-foreground/50 text-base mb-3">
          {keyValue
            ? `We've got everything we need.`
            : `Your answers have been submitted to the creator of "${form.title}".`}
        </p>
        <p className="text-foreground/40 text-sm mb-2">
          The form creator will be in touch if needed.
        </p>
        {submissionTime && (
          <p className="text-foreground/25 text-xs mb-10 tabular-nums">
            Submitted {submissionTime}{submissionId ? ` · ref ${submissionId.slice(0, 8)}` : ''}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="p-6 rounded-2xl bg-accent-amber/[0.07] border border-accent-amber/15 text-left"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-amber">Filled with Voca</span>
            <div className="flex-1 h-px bg-accent-amber/15" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">
            The voice-first form builder.
          </p>
          <p className="text-sm text-foreground/50 mb-5">
            Replace cold forms with warm AI conversations. Higher completion, richer data.
          </p>
          <a
            href="/?ref=form_completion"
            className="inline-flex items-center gap-2 bg-accent-amber text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity"
          >
            Create your own — free <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </motion.div>
      </motion.div>
    </motion.main>
  )
}

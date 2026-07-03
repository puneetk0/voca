'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Loader2 } from 'lucide-react'

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
        <span className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full bg-accent-amber/10 ring-1 ring-accent-amber/25">
          <CheckCircle2 className="h-7 w-7 text-accent-amber" />
        </span>

        <h2 className="font-serif text-4xl font-medium tracking-tight mb-3 text-foreground">
          {userName ? `All set, ${userName.split(' ')[0]}.` : 'All done!'}
        </h2>
        <p className="text-foreground/50 text-base mb-10">
          {keyValue ? 'Your answers are in. Thank you for taking the time.' : 'Your answers are in. Thank you for taking the time.'}
        </p>

        {/* Receipt */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6 }}
          className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-6 py-5 text-left"
        >
          <div className="flex items-center justify-between gap-4 border-b border-foreground/[0.06] pb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">Form</span>
            <span className="truncate text-sm font-medium text-foreground">{form.title}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-foreground/[0.06] py-3">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">Submitted</span>
            <span className="text-sm text-foreground/70 tabular-nums">{submissionTime ?? 'Just now'}</span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-3">
            <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">Reference</span>
            <span className="font-mono text-sm text-foreground/70">{submissionId ? submissionId.slice(0, 8) : '—'}</span>
          </div>
        </motion.div>

        <p className="mt-10 text-xs text-foreground/30">
          Powered by <a href="/?ref=form_completion" className="text-foreground/45 underline underline-offset-2 hover:text-accent-amber transition-colors">Voca</a> — create your own voice form
        </p>
      </motion.div>
    </motion.main>
  )
}

'use client'

import { useState, useTransition, useRef } from 'react'
import { joinWaitlist } from '@/lib/actions/waitlist'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Loader2, Mail } from 'lucide-react'

export function WaitlistForm({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark'
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || isPending) return

    startTransition(async () => {
      const result = await joinWaitlist(email)
      if (result.success) {
        setState('success')
        if (typeof window !== 'undefined' && (window as any).posthog) {
          (window as any).posthog.capture('waitlist_joined', { email })
        }
      } else {
        setState('error')
        setMessage(result.error ?? 'Something went wrong.')
      }
    })
  }

  if (state === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`relative mx-auto max-w-sm overflow-hidden rounded-2xl border px-6 py-6 text-center ${
          dark
            ? 'border-accent-amber/20 bg-gradient-to-b from-accent-amber/[0.12] to-transparent'
            : 'border-accent-amber/25 bg-gradient-to-b from-accent-amber/[0.08] to-transparent'
        }`}
      >
        {/* soft brand glow */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-[radial-gradient(50%_100%_at_50%_100%,rgba(234,140,20,0.22),transparent)]" />
        <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent-amber to-orange-500 shadow-[0_6px_20px_-6px_rgba(234,140,20,0.7)]">
          <CheckCircle2 className="h-6 w-6 text-white" />
        </span>
        <p className={`relative mt-4 font-serif text-2xl tracking-tight ${dark ? 'text-white' : 'text-foreground'}`}>
          You&apos;re on the list.
        </p>
        <p className={`relative mx-auto mt-1.5 flex items-center justify-center gap-1.5 text-sm ${dark ? 'text-white/55' : 'text-foreground/55'}`}>
          <Mail className="h-3.5 w-3.5 shrink-0" />
          Check your inbox for a welcome from us.
        </p>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          ref={inputRef}
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          aria-label="Email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (state === 'error') setState('idle')
          }}
          placeholder="you@work.com"
          disabled={isPending}
          className={`flex-1 rounded-full px-5 py-4 text-[15px] transition-all focus:outline-none focus:ring-4 disabled:opacity-50 ${
            dark
              ? 'border border-white/15 bg-white/[0.06] text-white placeholder:text-white/40 focus:border-white/40 focus:ring-white/10'
              : 'border border-foreground/12 bg-foreground/[0.03] text-foreground placeholder:text-foreground/35 focus:border-accent-amber/50 focus:bg-background focus:ring-accent-amber/10'
          }`}
        />
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="group flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#e07d00] to-[#b35b00] px-8 py-4 text-[15px] font-bold text-white shadow-[0_8px_24px_-6px_rgba(201,106,0,0.7)] ring-1 ring-inset ring-white/15 transition-all hover:shadow-[0_10px_30px_-6px_rgba(201,106,0,0.85)] hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-45 disabled:shadow-none"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {compact ? 'Get access' : 'Get early access'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>

      {state === 'error' && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2.5 pl-1 text-sm text-accent-rose"
        >
          {message}
        </motion.p>
      )}
    </form>
  )
}

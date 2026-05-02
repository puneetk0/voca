'use client'

import { useState, useTransition, useRef } from 'react'
import { joinWaitlist } from '@/lib/actions/waitlist'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'

export function WaitlistForm() {
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
        setMessage("You're on the list. Puneet will reach out personally — expect a plain-text email, not a newsletter.")
        // Fire PostHog event if available
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
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-sage/15 ring-1 ring-accent-sage/30">
          <CheckCircle2 className="h-7 w-7 text-accent-sage" />
        </div>
        <p className="text-lg font-medium text-foreground">You're in.</p>
        <p className="max-w-sm text-sm text-foreground/50 leading-relaxed">{message}</p>
      </motion.div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id="waitlist-email"
            type="email"
            name="email"
            autoComplete="email"
            required
            aria-label="Email address for waitlist"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (state === 'error') setState('idle')
            }}
            placeholder="your@email.com"
            disabled={isPending}
            className="w-full rounded-full border border-foreground/10 bg-foreground/[0.04] px-6 py-3.5 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-accent-amber/50 disabled:opacity-50 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          aria-label="Join the waitlist"
          className="flex items-center justify-center gap-2 rounded-full bg-accent-amber px-7 py-3.5 text-sm font-semibold text-black transition-all hover:opacity-90 hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 whitespace-nowrap"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Join the Waitlist
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {state === 'error' && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-3 text-center text-sm text-amber-400"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="mt-4 text-center text-xs text-foreground/30">
        Limited beta access. No spam. Just a personal note from Puneet.
      </p>
    </form>
  )
}

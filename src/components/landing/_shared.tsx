'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Scroll-reveal wrapper. Fades + rises into view once; static if reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Concentric "sound ripple" rings — the recurring voice motif. Decorative. */
export function SoundRipple({ className = '', color = 'var(--color-accent-amber)' }: { className?: string; color?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-full w-full">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="ripple-ring absolute inset-0 rounded-full border"
            style={{ borderColor: color, opacity: 0.25, animationDelay: `${i * 1.05}s` }}
          />
        ))}
      </div>
    </div>
  )
}

/** Small uppercase section eyebrow, optionally with an editorial number. */
export function Eyebrow({ children, n }: { children: ReactNode; n?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-amber">
      {n && <span className="font-mono text-[11px] font-normal tracking-normal text-foreground/30">{n}</span>}
      {children}
    </div>
  )
}

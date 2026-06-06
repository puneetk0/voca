'use client'

import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type ConfirmedAnswer = {
  fieldId: string
  label: string
  value: string
  fieldType: string
}


interface ScrollOfTruthProps {
  confirmedAnswers: ConfirmedAnswer[]
  /** When true (final question answered): expand to full-screen for 3s pause */
  isExpanding: boolean
}

const MAX_VISIBLE = 5

/**
 * The "Scroll of Truth" — confirmed answers stacked as right-aligned muted bubbles.
 * Capped at 5 visible. Older answers require explicit scroll.
 * On isExpanding: animates to full-screen height for the 3-second reflective pause.
 */
export function ScrollOfTruth({ confirmedAnswers, isExpanding }: ScrollOfTruthProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  if (confirmedAnswers.length === 0 && !isExpanding) return null

  // Show only the last MAX_VISIBLE answers normally; all answers when expanding
  const visible = isExpanding ? confirmedAnswers : confirmedAnswers.slice(-MAX_VISIBLE)

  return (
    <motion.div
      layout
      animate={isExpanding ? { height: '100vh', opacity: 1 } : { height: 'auto', opacity: 1 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="w-full overflow-hidden"
    >
      <div
        ref={scrollRef}
        className="flex flex-col items-end gap-2 px-4 pt-4 pb-2 overflow-y-auto max-h-[40vh]"
        style={{ scrollbarWidth: 'none' }}
      >
        <AnimatePresence initial={false}>
          {visible.map((answer, i) => (
            <motion.div
              key={answer.fieldId}
              layout
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="max-w-[80%] text-right"
            >
              <p className="text-[10px] uppercase tracking-widest text-foreground/25 mb-0.5 font-sans">
                {answer.label}
              </p>
              <div className="inline-block bg-foreground/[0.05] border border-foreground/[0.06] rounded-2xl rounded-tr-sm px-4 py-2">
                <p className="text-sm font-mono text-foreground/70 break-words">
                  {answer.fieldType === 'file'
                    ? (answer.value.split('/').pop() ?? answer.value)
                    : answer.value}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* When expanded: show ALL answers with their labels clearly */}
        {isExpanding && confirmedAnswers.length > MAX_VISIBLE && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-foreground/25 font-sans mt-2 self-center"
          >
            scroll to see all
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

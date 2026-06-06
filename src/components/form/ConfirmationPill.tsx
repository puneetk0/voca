'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Pencil } from 'lucide-react'

interface ConfirmationPillProps {
  fieldLabel: string
  value: string
  fieldType: string
  onAutoConfirm: () => void
  onEdit: () => void
  durationMs?: number
}

/**
 * Appears immediately when a value is extracted.
 * A 2px progress line depletes over durationMs (default 2000ms).
 * Auto-confirms when the line hits zero.
 * Tapping the pill cancels auto-confirm and opens edit mode.
 */
export function ConfirmationPill({
  fieldLabel,
  value,
  fieldType,
  onAutoConfirm,
  onEdit,
  durationMs = 2000,
}: ConfirmationPillProps) {
  const [confirmed, setConfirmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!editing) {
        setConfirmed(true)
        onAutoConfirm()
      }
    }, durationMs)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, editing])

  // Format display value by field type
  const displayValue = fieldType === 'file'
    ? value.split('/').pop() ?? value  // show filename only
    : value

  if (editing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 mb-3 flex items-center gap-2"
      >
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="flex-1 bg-foreground/[0.04] border border-foreground/[0.12] rounded-full px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-amber/40 font-mono"
          aria-label={`Edit your answer for ${fieldLabel}`}
        />
        <button
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current)
            setEditing(false)
            onEdit()  // caller will re-inject the edited value into AI conversation
          }}
          aria-label="Confirm edit"
          className="shrink-0 p-2 rounded-full bg-accent-amber text-black hover:opacity-90 transition-opacity"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: confirmed ? 0.45 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="mx-4 mb-3"
    >
      <button
        onClick={() => {
          if (timerRef.current) clearTimeout(timerRef.current)
          setEditing(true)
        }}
        className="w-full text-left relative overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3 hover:border-foreground/[0.15] transition-colors group"
        aria-label={`${fieldLabel}: ${displayValue} — tap to edit`}
      >
        {/* Label + value */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-foreground/30 font-sans mb-0.5">{fieldLabel}</p>
            <p className="text-sm font-mono text-foreground truncate">{displayValue}</p>
          </div>
          <Pencil className="h-3.5 w-3.5 text-foreground/20 group-hover:text-foreground/50 shrink-0 transition-colors" />
        </div>

        {/* 2px progress drain line */}
        {!confirmed && (
          <div
            className="pill-timer absolute bottom-0 left-0 h-[2px] bg-accent-amber/60 rounded-full"
            style={{ animationDuration: `${durationMs}ms` }}
          />
        )}
      </button>
    </motion.div>
  )
}

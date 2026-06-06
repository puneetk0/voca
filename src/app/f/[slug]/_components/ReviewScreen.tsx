'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Pencil, Check, AlertTriangle, ExternalLink } from 'lucide-react'

type Field = {
  id: string
  label: string
  field_type: string
  options?: string[]
}

type Props = {
  form: { title: string }
  fields: Field[]
  answers: Record<string, string>
  onAnswerChange: (fieldId: string, value: string) => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}

function AnswerDisplay({
  field,
  value,
  onChange,
}: {
  field: Field
  value: string
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const isFile = field.field_type === 'file'
  const isImage = isFile && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(value)
  const isVideo = isFile && /\.(mp4|mov|webm|ogg)$/i.test(value)

  if (isFile && value) {
    return (
      <div className="space-y-2">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Uploaded" className="max-h-32 rounded-xl object-cover border border-foreground/10" />
        ) : isVideo ? (
          <video src={value} controls className="max-h-32 w-full rounded-xl border border-foreground/10" />
        ) : (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground/70 hover:text-foreground bg-foreground/[0.04] px-4 py-2 rounded-full transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View file
          </a>
        )}
      </div>
    )
  }

  if (field.field_type === 'mcq' && field.options?.length) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        {field.options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-full text-sm font-sans transition-all ${
              value === opt
                ? 'bg-foreground text-background shadow-sm'
                : 'bg-foreground/[0.04] text-foreground/50 hover:bg-foreground/[0.08] border border-foreground/10'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  if (editing) {
    const InputEl = field.field_type === 'textarea' ? 'textarea' : 'input'
    return (
      <div className="flex items-start gap-2">
        <InputEl
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && field.field_type !== 'textarea') setEditing(false) }}
          type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : 'text'}
          rows={field.field_type === 'textarea' ? 3 : undefined}
          className="flex-1 bg-foreground/[0.03] border border-accent-amber/30 rounded-xl px-4 py-2 text-foreground font-mono text-base focus:outline-none focus:ring-2 focus:ring-accent-amber/30 resize-none"
        />
        <button
          onClick={() => setEditing(false)}
          className="mt-1 p-2 rounded-full bg-accent-sage/10 text-accent-sage hover:bg-accent-sage/20 transition-colors shrink-0"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-start gap-3 w-full text-left"
    >
      <span className={`font-mono text-base leading-relaxed flex-1 ${value ? 'text-foreground' : 'text-foreground/25 italic'}`}>
        {value || 'Not answered — tap to add'}
      </span>
      <Pencil className="h-3.5 w-3.5 text-foreground/20 group-hover:text-foreground/50 transition-colors mt-1 shrink-0" />
    </button>
  )
}

export default function ReviewScreen({ form, fields, answers, onAnswerChange, onSubmit, submitting, submitError }: Props) {
  const answeredCount = fields.filter(f => answers[f.id]).length

  return (
    <main className="max-w-xl mx-auto py-12 px-6 min-h-[100dvh] flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1"
      >
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight mb-2">
            Your story so far.
          </h1>
          <p className="text-foreground/40 text-sm font-sans">
            {answeredCount} of {fields.length} answered · Tap any answer to edit
          </p>
        </header>

        <div className="space-y-8 pb-10">
          <AnimatePresence>
            {fields.map((field, i) => (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="space-y-1.5"
              >
                <p className="text-xs font-medium text-foreground/35 uppercase tracking-wider font-sans">
                  {field.label}
                </p>
                <AnswerDisplay
                  field={field}
                  value={answers[field.id] || ''}
                  onChange={v => onAnswerChange(field.id, v)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="pt-6 pb-6 sticky bottom-0 bg-background/95 backdrop-blur-xl border-t border-foreground/[0.06] space-y-3">
        {submitError && (
          <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-sans">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-sans font-medium text-background hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
        >
          {submitting
            ? 'Finishing up...'
            : <><CheckCircle2 className="h-5 w-5 opacity-70" /> Looks good, submit</>}
        </button>
      </div>
    </main>
  )
}

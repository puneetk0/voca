'use client'

import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'

export default function SuccessScreen({
  form,
  fields,
  answers,
}: {
  form: { title: string }
  fields: Array<{ id: string; label: string; field_type: string }>
  answers: Record<string, string>
}) {
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

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.0, ease: 'easeOut' }}
      className="min-h-[100dvh] flex flex-col items-center justify-center p-8 bg-background"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7 }}
        className="text-center max-w-md w-full"
      >
        <h2 className="text-4xl font-serif tracking-tight mb-3 text-foreground">
          {userName ? `All set, ${userName.split(' ')[0]}.` : 'All done!'}
        </h2>

        <p className="text-foreground/50 text-base mb-10">
          {keyValue
            ? `We've got everything we need.`
            : `Your answers have been submitted to the creator of "${form.title}".`}
        </p>

        <div className="p-6 rounded-2xl bg-accent-amber/8 border border-accent-amber/15 text-left">
          <p className="text-xs text-foreground/40 uppercase tracking-widest mb-2 font-sans">Voca</p>
          <p className="text-base font-serif font-medium text-foreground mb-4">
            Build your own conversational form — free forever.
          </p>
          <a
            href="/?ref=form_completion"
            className="inline-flex items-center gap-2 bg-foreground text-background text-sm font-semibold px-5 py-2.5 rounded-full hover:opacity-80 transition-opacity"
          >
            Create Yours <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-8 text-xs text-foreground/20 font-sans"
        >
          Powered by Voca
        </motion.p>
      </motion.div>
    </motion.main>
  )
}

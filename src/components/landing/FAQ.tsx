'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

const QA = [
  {
    q: 'What exactly is Voca?',
    a: 'Voca is a voice-first form builder. Instead of showing a wall of fields, an AI interviews each respondent in a natural conversation — by voice or text — and turns their answers into clean, structured data for you.',
  },
  {
    q: 'Do respondents need an app or account?',
    a: 'No. You share a single link. It opens in any browser on any phone or laptop — no install, no login. They can talk, or type if they prefer.',
  },
  {
    q: 'Which languages does it understand?',
    a: 'English and Hindi today, including natural Hinglish code-switching mid-sentence. More languages are on the roadmap.',
  },
  {
    q: 'Is my data secure?',
    a: 'Every form is protected with row-level security, responses are stored in your own database, and voice clips live in private storage. You own your data and can export it any time.',
  },
  {
    q: 'What does it cost?',
    a: 'Voca is in private beta right now. Join the waitlist and we&apos;ll reach out personally with early access — no credit card, no commitment.',
  },
  {
    q: 'When can I use it?',
    a: 'We&apos;re onboarding beta users in waves. Add your email below and you&apos;ll hear from Puneet directly, usually within a few days.',
  },
]

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-foreground/[0.08]">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-[17px] font-medium text-foreground">{q}</span>
        <Plus className={`h-5 w-5 shrink-0 text-foreground/40 transition-transform duration-300 ${open ? 'rotate-45' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p
              className="pb-5 pr-8 text-[15px] leading-relaxed text-foreground/55"
              dangerouslySetInnerHTML={{ __html: a }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24 scroll-mt-20">
      <Reveal>
        <div className="flex flex-col items-center text-center">
          <Eyebrow n="07">FAQ</Eyebrow>
          <h2 className="mt-5 font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Questions, answered
          </h2>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="mt-12">
          {QA.map(item => (
            <Item key={item.q} {...item} />
          ))}
        </div>
      </Reveal>
    </section>
  )
}

'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles, Mic, Languages, BarChart3, Link2, AudioLines, CheckCircle2 } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

// Small living accents — the cards should feel like the product, not stock tiles.

function WaveAccent() {
  const reduce = useReducedMotion()
  return (
    <div className="mt-5 flex h-9 items-end gap-1" aria-hidden>
      {[10, 22, 14, 28, 18, 30, 12, 24, 16, 26, 11, 20].map((h, i) =>
        reduce ? (
          <span key={i} className="w-1 rounded-full bg-accent-amber/50" style={{ height: h }} />
        ) : (
          <motion.span
            key={i}
            className="w-1 rounded-full bg-accent-amber/50"
            animate={{ height: [h * 0.4, h, h * 0.55, h * 0.9, h * 0.4] }}
            transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.08, ease: 'easeInOut' }}
          />
        ),
      )}
    </div>
  )
}

function PillAccent() {
  return (
    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-background py-1.5 pl-2.5 pr-3.5" aria-hidden>
      <CheckCircle2 className="h-3.5 w-3.5 text-accent-sage" />
      <span className="text-[11px] text-foreground/45">Email:</span>
      <span className="font-mono text-xs text-foreground">johndoe@yahoo.com</span>
    </div>
  )
}

const FEATURES: {
  icon: typeof Sparkles
  title: string
  body: string
  accent?: React.ComponentType
}[] = [
  {
    icon: Sparkles,
    title: 'AI that actually listens',
    body: 'Someone says “john doe at gmail, no wait, yahoo.” Voca catches the fix. No regex, no re-asking.',
    accent: PillAccent,
  },
  {
    icon: Mic,
    title: 'Voice first, human paced',
    body: 'A warm voice asks one thing at a time, reacts to what people say, and rolls with corrections mid sentence.',
    accent: WaveAccent,
  },
  {
    icon: Languages,
    title: 'Hinglish, natively',
    body: 'People answer the way they actually talk. Voca follows code switching between Hindi and English without missing a beat.',
  },
  {
    icon: BarChart3,
    title: 'Insights, not just rows',
    body: 'A live dashboard with drop-off funnels, completion time, device breakdown, and answer sentiment.',
  },
  {
    icon: Link2,
    title: 'No app, just a link',
    body: 'Opens in any browser on any phone. Prefer typing? The text fallback is always one tap away.',
  },
  {
    icon: AudioLines,
    title: 'Hear every answer',
    body: 'Play back the original voice clip for any response, right from your dashboard.',
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
      <Reveal>
        <div className="flex flex-col items-center text-center">
          <Eyebrow n="03">Features</Eyebrow>
          <h2 className="mt-5 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Everything a form can&apos;t do
          </h2>
          <p className="mt-4 max-w-lg text-lg text-foreground/55">
            Built for how people really talk, and for the person who has to make sense of the answers.
          </p>
        </div>
      </Reveal>

      <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body, accent: Accent }, i) => (
          <Reveal key={title} delay={(i % 3) * 0.06}>
            <div className="group relative h-full overflow-hidden rounded-3xl border border-foreground/[0.08] bg-foreground/[0.02] p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/[0.14] hover:bg-foreground/[0.035]">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-amber/15 to-accent-amber/5 text-accent-amber ring-1 ring-inset ring-accent-amber/10 transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <h3 className="mt-6 font-serif text-xl text-foreground">{title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-foreground/55">{body}</p>
              {Accent && <Accent />}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

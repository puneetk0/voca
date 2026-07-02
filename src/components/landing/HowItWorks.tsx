import { PenLine, Share2, MessagesSquare } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

const STEPS = [
  {
    icon: PenLine,
    title: 'Describe it',
    body: 'Type what you want to collect in plain language — “name, email, how they heard about us, and a rating out of 10.” Voca drafts the form in seconds.',
  },
  {
    icon: Share2,
    title: 'Share one link',
    body: 'Send a single link. No app to install, no login for respondents. It works on any phone or laptop, over voice or text.',
  },
  {
    icon: MessagesSquare,
    title: 'Voca interviews them',
    body: 'A warm AI voice asks one question at a time, handles messy answers and corrections, and hands you clean, structured data in real time.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-24 scroll-mt-20">
      <Reveal>
        <div className="flex flex-col items-center text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-5 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            From idea to answers in three steps
          </h2>
        </div>
      </Reveal>

      <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 0.08}>
            <div className="relative h-full rounded-3xl border border-foreground/[0.08] bg-foreground/[0.02] p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-amber/10 text-accent-amber">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-sm text-foreground/30">0{i + 1}</span>
              </div>
              <h3 className="mt-6 font-serif text-xl text-foreground">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

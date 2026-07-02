import { MessageSquareHeart, Briefcase, PartyPopper, LineChart, Microscope, Rocket } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

const CASES = [
  { icon: MessageSquareHeart, name: 'Customer feedback', desc: 'Satisfaction, NPS, and honest open feedback.' },
  { icon: Briefcase, name: 'Job applications', desc: 'Screen candidates with a natural first chat.' },
  { icon: PartyPopper, name: 'Event RSVPs', desc: 'Headcount, dietary needs, and preferences.' },
  { icon: LineChart, name: 'Product surveys', desc: 'Usage, ratings, and feature requests.' },
  { icon: Microscope, name: 'Research interviews', desc: 'Longer, richer qualitative answers.' },
  { icon: Rocket, name: 'User onboarding', desc: 'Learn who signed up and what they need.' },
]

export function UseCases() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <div className="flex flex-col items-center text-center">
          <Eyebrow>Made for</Eyebrow>
          <h2 className="mt-5 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Anywhere you&apos;d rather ask than make them type
          </h2>
        </div>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CASES.map(({ icon: Icon, name, desc }, i) => (
          <Reveal key={name} delay={(i % 3) * 0.06}>
            <div className="flex h-full items-start gap-4 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-6 transition-colors hover:bg-foreground/[0.04]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-amber/10 text-accent-amber">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-medium text-foreground">{name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/50">{desc}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

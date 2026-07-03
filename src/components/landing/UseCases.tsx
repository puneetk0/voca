import { MessageSquareHeart, Briefcase, PartyPopper, LineChart, Microscope, Rocket, ArrowUpRight } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

const CASES = [
  { icon: MessageSquareHeart, name: 'Customer feedback', desc: 'Satisfaction, NPS, honest open feedback.' },
  { icon: Briefcase, name: 'Job applications', desc: 'Screen candidates with a natural first chat.' },
  { icon: PartyPopper, name: 'Event RSVPs', desc: 'Headcount, dietary needs, preferences.' },
  { icon: LineChart, name: 'Product surveys', desc: 'Usage, ratings, feature requests.' },
  { icon: Microscope, name: 'Research interviews', desc: 'Longer, richer qualitative answers.' },
  { icon: Rocket, name: 'User onboarding', desc: 'Learn who signed up and what they need.' },
]

export function UseCases() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <Reveal>
          <div>
            <Eyebrow n="06">Made for</Eyebrow>
            <h2 className="mt-5 font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
              Anywhere you&apos;d rather ask than make them type
            </h2>
            <p className="mt-4 text-lg text-foreground/55">
              If the answers matter more than the checkboxes, it belongs in a conversation.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {CASES.map(({ icon: Icon, name, desc }) => (
              <li key={name} className="group flex items-start gap-3.5 border-b border-foreground/[0.07] py-5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-amber/10 text-accent-amber">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium text-foreground">
                    {name}
                    <ArrowUpRight className="h-3.5 w-3.5 text-foreground/0 transition-colors group-hover:text-foreground/30" />
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-foreground/50">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

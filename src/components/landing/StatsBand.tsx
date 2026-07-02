import { Reveal, Eyebrow } from './_shared'

const STATS = [
  { figure: '3×', prefix: 'up to', caption: 'more responses completed vs. static forms', sup: '1' },
  { figure: '5×', prefix: 'up to', caption: 'longer, richer open-ended answers', sup: '3' },
  { figure: '25%', prefix: '+', caption: 'lift from asking one question at a time', sup: '4' },
]

export function StatsBand() {
  return (
    <section className="relative overflow-hidden border-y border-foreground/[0.06] bg-[radial-gradient(60%_120%_at_50%_0%,rgba(234,140,20,0.08),transparent_70%)]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="flex flex-col items-center text-center">
            <Eyebrow>Why it works</Eyebrow>
            <h2 className="mt-5 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
              Talking beats typing. The data agrees.
            </h2>
          </div>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
          {STATS.map((s, i) => (
            <Reveal key={s.caption} delay={i * 0.08}>
              <div className="text-center">
                <p className="text-sm font-medium uppercase tracking-wider text-foreground/40">{s.prefix}</p>
                <p className="mt-1 font-serif text-6xl font-medium tracking-tight text-foreground sm:text-7xl">
                  {s.figure}
                  <sup className="align-super text-base text-foreground/30">{s.sup}</sup>
                </p>
                <p className="mx-auto mt-3 max-w-[15rem] text-sm leading-relaxed text-foreground/55">{s.caption}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

import { Reveal } from './_shared'

export function FounderNote() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <figure className="relative overflow-hidden rounded-3xl border border-foreground/[0.08] bg-foreground/[0.02] p-10 sm:p-14">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(234,140,20,0.14),transparent_70%)]" />

          <blockquote className="relative font-serif text-2xl leading-relaxed tracking-tight text-foreground sm:text-[1.7rem]">
            “I kept watching people quit my forms halfway. Not because they didn&apos;t care. Answering
            just felt like a chore. So I built the thing I wished existed: a form that talks to you,
            listens the way a person would, and works in the languages we actually speak.”
          </blockquote>

          <figcaption className="relative mt-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-accent-amber to-orange-500 font-serif text-lg font-semibold text-white">
              P
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Puneet</p>
              <p className="text-xs text-foreground/45">Founder, Voca</p>
            </div>
          </figcaption>
        </figure>
      </Reveal>
    </section>
  )
}

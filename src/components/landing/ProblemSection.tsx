import { Reveal, Eyebrow } from './_shared'

export function ProblemSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <Reveal>
          <div>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-5 font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Forms are where
              <br />
              conversations go to die.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="space-y-6 text-lg leading-relaxed text-foreground/60">
            <p>
              A wall of empty boxes. Tiny labels. Dropdowns that don&apos;t fit what you actually mean.
              People rush, half-answer, or abandon the tab. Most static forms get finished
              <span className="font-semibold text-foreground/80"> barely a third of the time.</span>
              <sup className="text-foreground/30">2</sup>
            </p>
            <p>
              The irony? You wanted a <em>conversation</em>. You wanted to know how people really feel,
              in their own words. A form flattens all of that into a spreadsheet of one-word replies.
            </p>
            <p className="font-serif text-2xl text-foreground">
              What if filling a form felt like being listened to?
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

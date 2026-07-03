import { Reveal } from './_shared'

// Full-bleed dark contrast band — the editorial "moment" of the page.
export function ProblemSection() {
  return (
    <section className="bg-[#161310]">
      <div className="mx-auto max-w-6xl px-6 py-28 sm:py-36">
        <Reveal>
          <div className="flex items-baseline gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-amber">
            <span className="font-mono text-[11px] font-normal tracking-normal text-white/30">01</span>
            The problem
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <Reveal delay={0.05}>
            <h2 className="font-serif text-4xl leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              Forms are where
              <br />
              conversations{' '}
              <span className="text-accent-amber">go to die.</span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="space-y-6 text-lg leading-relaxed text-white/55 lg:pt-2">
              <p>
                A wall of empty boxes. Tiny labels. Dropdowns that don&apos;t fit what you actually mean.
                People rush, half-answer, or abandon the tab. Most static forms get finished
                <span className="text-white/85"> barely a third of the time.</span>
                <sup className="text-white/30">2</sup>
              </p>
              <p>
                The irony? You wanted a <em className="text-white/75">conversation</em>. You wanted to know how
                people really feel, in their own words. A form flattens all of that into a
                spreadsheet of one-word replies.
              </p>
              <p className="font-serif text-2xl text-white">
                What if filling a form felt like being listened to?
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

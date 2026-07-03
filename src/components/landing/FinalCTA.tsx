import { WaitlistForm } from '@/components/WaitlistForm'
import { Reveal } from './_shared'

export function FinalCTA() {
  return (
    <section id="join" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[#161310] px-6 py-24 text-center sm:px-16">
          {/* warm glows + concentric rings */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(234,140,20,0.28),transparent_65%)]" />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2">
            {[280, 460, 640].map(s => (
              <span key={s} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]" style={{ width: s, height: s }} />
            ))}
          </div>

          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-serif text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Give your forms a voice.
            </h2>
            <p className="mx-auto mt-5 max-w-md text-lg text-white/55">
              Join the private beta and get a personal note from Puneet.
            </p>

            <div className="mx-auto mt-10 max-w-xl">
              <WaitlistForm tone="dark" />
            </div>

            <p className="mt-6 text-sm text-white/40">Free during beta. No credit card.</p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

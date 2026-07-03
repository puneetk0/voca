import { WaitlistForm } from '@/components/WaitlistForm'
import DemoConversation from './DemoConversation'
import { Reveal } from './_shared'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* warm layered background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_45%_at_50%_0%,rgba(234,140,20,0.16),transparent_60%),radial-gradient(45%_40%_at_85%_30%,rgba(120,170,40,0.08),transparent_60%)]" />

      {/* copy */}
      <div className="mx-auto max-w-3xl px-6 pt-16 text-center sm:pt-24">
        <Reveal>
          <h1 className="font-serif text-[3rem] font-semibold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-[4.75rem]">
            It&apos;s not a form.
            <br />
            <span className="bg-gradient-to-r from-[#e08600] via-[#d9504a] to-[#c026a8] bg-clip-text text-transparent">
              It&apos;s a conversation.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-foreground/60 sm:text-xl">
            An AI voice interviews the people filling your form, understands English and Hinglish,
            and hands you clean, structured answers.
          </p>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mx-auto mt-9 max-w-xl">
            <WaitlistForm />
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mt-5 text-sm text-foreground/45">Free during beta. No credit card.</p>
        </Reveal>
      </div>

      {/* full-width animation */}
      <Reveal delay={0.16} y={28}>
        <div className="mx-auto max-w-5xl px-6 pb-24 pt-16">
          <DemoConversation />
        </div>
      </Reveal>
    </section>
  )
}

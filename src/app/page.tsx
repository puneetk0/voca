import type { Metadata } from 'next'
import Link from 'next/link'
import { WaitlistForm } from '@/components/WaitlistForm'
import { Mic2 } from 'lucide-react'

export const metadata: Metadata = {
  title: "Voca — It's not a form. It's a conversation.",
  description:
    'Voca replaces your cold, lifeless forms with warm AI-powered voice conversations. Join the beta.',
  openGraph: {
    title: "It's not a form. It's a conversation.",
    description:
      'Voca replaces your cold, lifeless forms with warm AI-powered voice conversations. Join the beta.',
    type: 'website',
  },
}

export default function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string }>
}) {
  return (
    <main className="min-h-[100dvh] flex flex-col bg-background overflow-hidden">
      {/* ─── Nav ─── */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-accent-amber" />
          <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Voca
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-foreground/50 hover:text-foreground transition-colors"
        >
          Sign in →
        </Link>
      </nav>

      {/* ─── Hero ─── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 pt-6 gap-10">

        {/* Label pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-amber/20 bg-accent-amber/[0.06] px-4 py-1.5 text-xs font-semibold text-accent-amber tracking-wider uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-amber animate-pulse" />
          Private Beta — Join the Waitlist
        </div>

        {/* H1 */}
        <div className="text-center max-w-3xl">
          <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-medium tracking-tight text-foreground leading-[1.08]">
            It's not a form.
            <br />
            <span className="text-foreground/40">It's a conversation.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-foreground/50 font-light max-w-xl mx-auto leading-relaxed">
            Voca replaces your cold, lifeless forms with warm AI-powered voice conversations.
            Higher completion. Richer data. No typing required.
          </p>
        </div>

        {/* ─── Demo Video Placeholder ─── */}
        {/* Swap the <div> below for a <video> when you have the real clip:         */}
        {/* <video src="/demo.mp4" autoPlay muted loop playsInline                  */}
        {/*   poster="/demo-poster.jpg"                                             */}
        {/*   className="w-full max-w-2xl rounded-2xl border border-foreground/10  */}
        {/*     shadow-2xl shadow-black/40 object-cover aspect-video" />            */}
        <div
          className="relative w-full max-w-2xl rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] aspect-video flex items-center justify-center shadow-2xl shadow-black/30 overflow-hidden"
          aria-label="Product demo video — coming soon"
        >
          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {/* Ambient glow orbs */}
          <div className="absolute top-1/4 left-1/4 h-40 w-40 rounded-full bg-accent-amber/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-40 w-40 rounded-full bg-accent-sage/10 blur-3xl" />

          {/* Play button placeholder */}
          <div className="relative flex flex-col items-center gap-4 z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5 border border-foreground/10 backdrop-blur-sm">
              <div className="ml-1 h-0 w-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-foreground/60" />
            </div>
            <p className="text-sm text-foreground/30 font-medium">Demo video coming soon</p>
          </div>

          {/* Corner labels that look like a real UI */}
          <div className="absolute top-3 left-4 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500/60" />
            <div className="h-2 w-2 rounded-full bg-yellow-500/60" />
            <div className="h-2 w-2 rounded-full bg-green-500/60" />
          </div>
          <div className="absolute bottom-3 right-4 text-xs text-foreground/20 font-mono">
            voca.app/f/demo
          </div>
        </div>

        {/* ─── Waitlist CTA ─── */}
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <WaitlistForm />
        </div>

        {/* ─── Social Proof ─── */}
        <div className="flex items-center gap-6 text-xs text-foreground/25">
          <span>Voice-first</span>
          <span className="h-1 w-1 rounded-full bg-foreground/20" />
          <span>AI-powered extraction</span>
          <span className="h-1 w-1 rounded-full bg-foreground/20" />
          <span>Built in India 🇮🇳</span>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <footer className="text-center px-6 py-5 text-xs text-foreground/20 border-t border-foreground/[0.04]">
        <span>© 2025 Voca</span>
        <span className="mx-2">·</span>
        <Link href="/login" className="hover:text-foreground/40 transition-colors">
          Sign in
        </Link>
        <span className="mx-2">·</span>
        <a
          href="https://github.com/puneetk0/voca"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground/40 transition-colors"
        >
          GitHub
        </a>
      </footer>
    </main>
  )
}

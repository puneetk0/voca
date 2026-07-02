import Link from 'next/link'
import { Mic2 } from 'lucide-react'

const SOURCES = [
  'Conversational and AI-intake forms complete up to 3× more often than static forms (serviceagent.ai; Typeform benchmarks, 2026).',
  'Typical static web-form completion is roughly 20 to 30% (industry benchmarks, 2026).',
  'Conversational formats yield 2.5 to 5× longer open-ended answers (tinycommand, 2026).',
  'Multi-step forms saw ~25% higher completion than single-page (Formstack, 650k+ submissions).',
]

export function LandingFooter() {
  return (
    <footer className="border-t border-foreground/[0.06]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Mic2 className="h-5 w-5 text-accent-amber" />
              <span className="font-serif text-xl font-semibold tracking-tight text-foreground">Voca</span>
            </div>
            <p className="mt-2 text-sm text-foreground/45">It&apos;s not a form. It&apos;s a conversation.</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground/50">
            <Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
            <a href="https://github.com/puneetk0/voca" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">GitHub</a>
          </div>
        </div>

        <div className="mt-12 border-t border-foreground/[0.05] pt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground/30">Sources</p>
          <ol className="mt-2 space-y-1">
            {SOURCES.map((s, i) => (
              <li key={i} className="text-xs leading-relaxed text-foreground/30">
                <sup className="mr-1">{i + 1}</sup>{s}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 text-xs text-foreground/30">
          <span>© 2026 Voca</span>
          <span>Built in India</span>
        </div>
      </div>
    </footer>
  )
}

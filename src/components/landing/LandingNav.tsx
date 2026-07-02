'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mic2 } from 'lucide-react'

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#compare', label: 'Compare' },
  { href: '#faq', label: 'FAQ' },
]

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'border-b border-foreground/[0.06] bg-background/80 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Mic2 className="h-5 w-5 text-accent-amber" />
          <span className="font-serif text-xl font-semibold tracking-tight text-foreground">Voca</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map(l => (
            <a key={l.href} href={l.href} className="text-sm text-foreground/55 transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden text-sm font-medium text-foreground/55 transition-colors hover:text-foreground sm:block">
            Sign in
          </Link>
          <a
            href="#join"
            className="rounded-full bg-accent-amber px-4 py-2 text-sm font-semibold text-black transition-all hover:opacity-90 hover:scale-[1.02] active:scale-95"
          >
            Join waitlist
          </a>
        </div>
      </nav>
    </header>
  )
}

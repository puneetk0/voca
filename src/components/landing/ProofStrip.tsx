import { Mic, Keyboard, Languages, ShieldCheck } from 'lucide-react'

const ITEMS = [
  { icon: Mic, label: 'Voice-first interviews' },
  { icon: Keyboard, label: 'Text fallback, always' },
  { icon: Languages, label: 'Hinglish, natively' },
  { icon: ShieldCheck, label: 'Your data, encrypted' },
]

export function ProofStrip() {
  return (
    <div className="border-y border-foreground/[0.06] bg-foreground/[0.015]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6 py-7">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm font-medium text-foreground/50">
            <Icon className="h-4 w-4 text-accent-amber/70" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

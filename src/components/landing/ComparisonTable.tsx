import { Check, Minus, Mic2 } from 'lucide-react'
import { Reveal, Eyebrow } from './_shared'

type Val = boolean | string
type Row = { label: string; voca: Val; gforms: Val; typeform: Val; tally: Val }

const COLS = ['Google Forms', 'Typeform', 'Tally'] as const

const ROWS: Row[] = [
  { label: 'Voice conversations', voca: true, gforms: false, typeform: false, tally: false },
  { label: 'Understands messy, spoken answers', voca: true, gforms: false, typeform: false, tally: false },
  { label: 'Hinglish / code-switching', voca: true, gforms: false, typeform: false, tally: false },
  { label: 'One question at a time', voca: true, gforms: false, typeform: true, tally: false },
  { label: 'Tone & sentiment capture', voca: true, gforms: false, typeform: false, tally: false },
  { label: 'Drop-off & device analytics', voca: true, gforms: 'Basic', typeform: 'Paid', tally: 'Basic' },
  { label: 'Free responses / month', voca: 'Unlimited', gforms: 'Unlimited', typeform: 'Only 10', tally: 'Unlimited' },
]

function Cell({ v, accent }: { v: Val; accent?: boolean }) {
  if (v === true)
    return (
      <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${accent ? 'bg-accent-amber text-white' : 'bg-accent-sage/12 text-accent-sage'}`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    )
  if (v === false) return <Minus className="mx-auto h-4 w-4 text-foreground/20" />
  return <span className={`text-[13px] ${accent ? 'font-semibold text-foreground' : 'text-foreground/50'}`}>{v}</span>
}

export function ComparisonTable() {
  return (
    <section id="compare" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-24">
      <Reveal>
        <div className="flex flex-col items-center text-center">
          <Eyebrow n="04">Compare</Eyebrow>
          <h2 className="mt-5 max-w-2xl font-serif text-3xl leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Not another form builder
          </h2>
          <p className="mt-4 max-w-lg text-lg text-foreground/55">
            The others help you build a form. Voca has the conversation for you.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-14 overflow-x-auto pb-2">
          <table className="w-full min-w-[680px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="w-[36%]" />
                <th className="px-3 pb-0 align-bottom">
                  <div className="rounded-t-2xl border-x border-t border-accent-amber/20 bg-gradient-to-b from-accent-amber/[0.14] to-accent-amber/[0.06] px-4 pb-4 pt-5">
                    <span className="flex items-center justify-center gap-1.5 font-serif text-lg font-semibold text-foreground">
                      <Mic2 className="h-4 w-4 text-accent-amber" /> Voca
                    </span>
                  </div>
                </th>
                {COLS.map(c => (
                  <th key={c} className="px-4 pb-5 align-bottom text-center text-[13px] font-medium text-foreground/45">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => {
                const last = i === ROWS.length - 1
                return (
                  <tr key={row.label} className="group">
                    <td className="border-t border-foreground/[0.07] py-4 pr-4 text-sm text-foreground/75">{row.label}</td>
                    <td
                      className={`border-x border-t border-accent-amber/20 bg-accent-amber/[0.05] px-4 py-4 text-center ${
                        last ? 'rounded-b-2xl border-b' : ''
                      }`}
                    >
                      <Cell v={row.voca} accent />
                    </td>
                    <td className="border-t border-foreground/[0.07] px-4 py-4 text-center"><Cell v={row.gforms} /></td>
                    <td className="border-t border-foreground/[0.07] px-4 py-4 text-center"><Cell v={row.typeform} /></td>
                    <td className="border-t border-foreground/[0.07] px-4 py-4 text-center"><Cell v={row.tally} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Reveal>

      <p className="mt-5 text-center text-xs text-foreground/35">
        Based on each product&apos;s standard plans as of 2026. Typeform&apos;s free plan caps at 10 responses per month.
      </p>
    </section>
  )
}

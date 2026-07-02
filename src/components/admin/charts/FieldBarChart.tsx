interface Props {
  options: string[]
  counts: Record<string, number>
  total: number
}

export function FieldBarChart({ options, counts, total }: Props) {
  const sorted = [...options].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
  const maxCount = Math.max(...sorted.map(o => counts[o] ?? 0), 1)

  if (options.length === 0) return <p className="text-xs text-foreground/30 italic">No options defined</p>

  return (
    <div className="space-y-2.5">
      {sorted.map(opt => {
        const count = counts[opt] ?? 0
        const barPct = Math.round((count / maxCount) * 100)
        const totalPct = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={opt}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-foreground/70 truncate max-w-[70%]">{opt}</span>
              <span className="text-foreground/40 tabular-nums ml-2 shrink-0">{count} · {totalPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-foreground/8 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-amber transition-[width] duration-500"
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

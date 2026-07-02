'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  data: { date: string; count: number }[]
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background border border-foreground/15 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="text-foreground/50 text-xs">{label}</p>
      <p className="font-semibold text-foreground">{payload[0].value} response{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

export function TrendChart({ data }: Props) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  // Show every ~5th label to avoid crowding
  const step = Math.ceil(data.length / 6)

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={data.length > 14 ? 8 : 14} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--color-foreground)', opacity: 0.35 }}
          tickLine={false}
          axisLine={false}
          interval={step - 1}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: 'var(--color-foreground)', opacity: 0.35 }}
          tickLine={false}
          axisLine={false}
          domain={[0, maxCount + 1]}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-foreground)', opacity: 0.04, radius: 4 }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.count > 0 ? 'var(--color-accent-amber)' : 'var(--color-foreground)'}
              fillOpacity={entry.count > 0 ? 0.85 : 0.08}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

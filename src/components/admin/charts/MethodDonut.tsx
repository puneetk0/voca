'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  voiceCount: number
  textCount: number
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-background border border-foreground/15 rounded-xl px-3 py-2 text-sm shadow-xl">
      <p className="font-semibold text-foreground">{payload[0].name}: {payload[0].value}</p>
    </div>
  )
}

export function MethodDonut({ voiceCount, textCount }: Props) {
  const total = voiceCount + textCount
  const dominant = voiceCount >= textCount ? 'Voice' : 'Text'
  const dominantPct = total > 0 ? Math.round((Math.max(voiceCount, textCount) / total) * 100) : 0

  const data = [
    { name: 'Voice', value: voiceCount || 0.001 },
    { name: 'Text', value: textCount || 0.001 },
  ]

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full" style={{ height: 130 }}>
        <ResponsiveContainer width="100%" height={130}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={58}
              dataKey="value"
              strokeWidth={0}
              paddingAngle={total === 0 ? 0 : 3}
            >
              <Cell fill="var(--color-accent-sage)" fillOpacity={0.85} />
              <Cell fill="var(--color-accent-indigo)" fillOpacity={0.7} />
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {total > 0 ? (
            <>
              <span className="text-xl font-bold tabular-nums">{dominantPct}%</span>
              <span className="text-xs text-foreground/40">{dominant}</span>
            </>
          ) : (
            <span className="text-xs text-foreground/30">No data</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-foreground/50">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-sage inline-block" />
          Voice {voiceCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-indigo inline-block" />
          Text {textCount}
        </span>
      </div>
    </div>
  )
}

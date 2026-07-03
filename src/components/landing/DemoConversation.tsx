'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Mic } from 'lucide-react'

type Turn = { role: 'ai' | 'user'; text: string }
const SCRIPT: Turn[] = [
  { role: 'ai', text: 'Hey! Quick one, what should I call you?' },
  { role: 'user', text: 'Puneet' },
  { role: 'ai', text: 'Love that, Puneet. Best email to reach you?' },
  { role: 'user', text: 'puneet at gmail dot com' },
  { role: 'ai', text: 'Got it, puneet@gmail.com. How did you hear about us?' },
  { role: 'user', text: 'A friend at a hackathon, actually' },
  { role: 'ai', text: "Perfect, that's everything. Thanks Puneet!" },
]

type OrbState = 'idle' | 'speaking' | 'listening'
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
type Msg = { id: number; role: 'ai' | 'user'; text: string }

function Orb({ state }: { state: OrbState }) {
  const skin =
    state === 'speaking'
      ? 'bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500'
      : state === 'listening'
      ? 'bg-gradient-to-br from-lime-300 via-lime-400 to-emerald-500'
      : 'bg-gradient-to-br from-amber-200 via-amber-300 to-orange-300'
  const glow =
    state === 'listening'
      ? 'shadow-[0_0_70px_-4px_rgba(132,204,22,0.55)]'
      : 'shadow-[0_0_70px_-4px_rgba(234,140,20,0.55)]'
  const ring = state === 'listening' ? 'bg-lime-400/25' : 'bg-amber-400/25'

  return (
    <div className="relative flex items-center justify-center" style={{ width: 168, height: 168 }}>
      {state !== 'idle' && (
        <>
          <span className={`absolute inset-0 rounded-full ${ring}`} style={{ animation: 'ripple-out 2.2s ease-out infinite' }} />
          <span className={`absolute inset-0 rounded-full ${ring}`} style={{ animation: 'ripple-out 2.2s ease-out infinite', animationDelay: '0.7s' }} />
        </>
      )}
      <motion.div
        className={`relative z-10 flex h-[136px] w-[136px] items-center justify-center rounded-full ${skin} ${glow}`}
        animate={state === 'idle' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={state === 'idle' ? { repeat: Infinity, duration: 3.4, ease: 'easeInOut' } : { duration: 0.45 }}
      >
        <span className="absolute left-7 top-6 h-9 w-9 rounded-full bg-white/30 blur-md" />
        {state === 'listening' && <WaveBars />}
        {state === 'speaking' && <Mic className="h-7 w-7 text-black/45" />}
      </motion.div>
    </div>
  )
}

function WaveBars() {
  return (
    <div className="flex items-center gap-[3px]">
      {[0, 1, 2, 3, 4].map(i => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-black/45"
          animate={{ height: [8, 30, 14, 24, 8] }}
          transition={{ repeat: Infinity, duration: 1, delay: i * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function Bubble({ m, typing }: { m: Msg; typing?: boolean }) {
  if (m.role === 'ai') {
    return (
      <div className="flex justify-start">
        <div className="ai-text max-w-[85%] rounded-2xl rounded-bl-sm bg-foreground/[0.04] px-4 py-2.5 text-[15px] leading-snug text-foreground">
          {m.text}
          {typing && <span className="caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent-amber" />}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-2 rounded-2xl rounded-br-sm border border-accent-amber/20 bg-accent-amber/[0.07] py-2 pl-2.5 pr-3.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-sage/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-sage">
          <Mic className="h-2.5 w-2.5" />
        </span>
        <span className="font-mono text-sm text-foreground">{m.text}</span>
      </div>
    </div>
  )
}

const STATIC_MSGS: Msg[] = [
  { id: 0, role: 'ai', text: 'Hey! Quick one, what should I call you?' },
  { id: 1, role: 'user', text: 'Puneet' },
  { id: 2, role: 'ai', text: 'Love that, Puneet. Best email to reach you?' },
  { id: 3, role: 'user', text: 'puneet at gmail dot com' },
]

export default function DemoConversation() {
  const reduce = useReducedMotion()
  const [orb, setOrb] = useState<OrbState>('idle')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [typingText, setTypingText] = useState<string | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (reduce) return
    cancelled.current = false
    let id = 0
    async function run() {
      while (!cancelled.current) {
        setMsgs([])
        for (const turn of SCRIPT) {
          if (cancelled.current) return
          if (turn.role === 'ai') {
            setOrb('speaking')
            setTypingText('')
            for (let i = 1; i <= turn.text.length; i++) {
              if (cancelled.current) return
              setTypingText(turn.text.slice(0, i))
              await sleep(26)
            }
            const mid = id++
            setMsgs(m => [...m.slice(-4), { id: mid, role: 'ai', text: turn.text }])
            setTypingText(null)
            await sleep(900)
          } else {
            setOrb('listening')
            await sleep(1400)
            if (cancelled.current) return
            const mid = id++
            setMsgs(m => [...m.slice(-4), { id: mid, role: 'user', text: turn.text }])
            setOrb('idle')
            await sleep(900)
          }
        }
        await sleep(1400)
      }
    }
    run()
    return () => { cancelled.current = true }
  }, [reduce])

  const shown = reduce ? STATIC_MSGS : msgs
  const status = orb === 'speaking' ? 'Speaking' : orb === 'listening' ? 'Listening' : 'Voca'

  return (
    <div className="relative mx-auto w-full max-w-4xl">
      <div aria-hidden className="absolute -inset-10 -z-10 bg-[radial-gradient(50%_50%_at_50%_40%,rgba(234,140,20,0.14),transparent_75%)]" />

      <div className="overflow-hidden rounded-[1.75rem] border border-foreground/[0.08] bg-background/70 shadow-[0_30px_80px_-30px_rgba(17,17,17,0.4)] backdrop-blur-sm">
        {/* chrome */}
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          </div>
          <span className="font-mono text-[11px] text-foreground/30">voca.app/f/your-form</span>
        </div>

        <div className="grid items-center gap-8 p-8 sm:p-10 md:grid-cols-[minmax(0,300px)_1fr] md:gap-12">
          {/* orb + status */}
          <div className="flex flex-col items-center gap-4">
            <Orb state={reduce ? 'idle' : orb} />
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/45">
              <span className={`h-1.5 w-1.5 rounded-full ${orb === 'listening' ? 'bg-lime-500' : orb === 'speaking' ? 'bg-amber-500' : 'bg-foreground/25'}`} />
              {status}
            </div>
          </div>

          {/* transcript */}
          <div className="flex min-h-[240px] flex-col justify-center gap-2.5">
            <AnimatePresence initial={false}>
              {shown.map(m => (
                <motion.div
                  key={m.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Bubble m={m} />
                </motion.div>
              ))}
            </AnimatePresence>
            {typingText !== null && !reduce && (
              <Bubble m={{ id: -1, role: 'ai', text: typingText }} typing />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

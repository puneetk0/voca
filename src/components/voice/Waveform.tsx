'use client'

import { useEffect, useRef, useState } from 'react'

interface WaveformProps {
  stream: MediaStream | null
  isActive: boolean
  color?: string
}

export default function Waveform({ stream, isActive, color = '#f59e0b' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const silenceTimerRef = useRef<number>(0)
  const [fallbackPulse, setFallbackPulse] = useState(false)

  useEffect(() => {
    if (!stream || !isActive) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return

    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)

    contextRef.current = ctx
    analyserRef.current = analyser
    sourceRef.current = source

    const canvas = canvasRef.current
    if (!canvas) return
    const cCtx = canvas.getContext('2d')
    if (!cCtx) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const allSilent = dataArray.every(v => v === 0)
      if (allSilent) {
        silenceTimerRef.current++
        if (silenceTimerRef.current > 180) { // ~3s at 60fps
          setFallbackPulse(true)
          return
        }
      } else {
        silenceTimerRef.current = 0
        setFallbackPulse(false)
      }

      const W = canvas.width
      const H = canvas.height
      cCtx.clearRect(0, 0, W, H)

      const barCount = Math.min(bufferLength, 20)
      const gap = 4
      const barWidth = (W - gap * (barCount - 1)) / barCount

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] / 255
        const barH = Math.max(4, value * H)
        const x = i * (barWidth + gap)
        const y = (H - barH) / 2

        // Colour fades from accent to dim as amplitude decays
        const alpha = 0.2 + value * 0.8
        cCtx.fillStyle = color
        cCtx.globalAlpha = alpha
        cCtx.beginPath()
        cCtx.roundRect(x, y, barWidth, barH, barWidth / 2)
        cCtx.fill()
      }
      cCtx.globalAlpha = 1
    }

    setFallbackPulse(false)
    silenceTimerRef.current = 0
    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      source.disconnect()
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {})
      }
    }
  }, [stream, isActive, color])

  if (fallbackPulse || !stream || !isActive) {
    return (
      <div className="flex items-center justify-center gap-1 h-10">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-accent-sage/60"
            style={{
              height: `${12 + Math.sin(i * 1.2) * 8}px`,
              animation: `pulse 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={60}
      className="rounded-lg"
    />
  )
}

'use client'

import { useEffect, useRef } from 'react'

interface WaveformProps {
  stream: MediaStream | null
  isActive: boolean
  color?: string
}

export default function Waveform({ stream, isActive, color = '#000000' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const smoothedRef = useRef<Float32Array | null>(null)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (!stream || !isActive) return

    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtxClass) return

    const ctx = new AudioCtxClass() as AudioContext
    // Browsers start an AudioContext 'suspended' until a gesture — resume it or
    // the analyser reports zero and the bars sit flat even while the mic works.
    // On iOS the resume only sticks inside a gesture, so also hook the next
    // tap anywhere on the page.
    const tryResume = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}) }
    tryResume()
    document.addEventListener('pointerdown', tryResume)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256          // 128 frequency bins
    analyser.smoothingTimeConstant = 0.5
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)

    const BAR_COUNT = 28
    const bufferLength = analyser.frequencyBinCount  // 128
    const dataArray = new Uint8Array(bufferLength)

    // Voice sits roughly in bins 2–70 of a 128-bin FFT at typical sample rates
    const startBin = 2
    const endBin = Math.min(70, bufferLength - 1)
    const binStep = (endBin - startBin) / BAR_COUNT

    smoothedRef.current = new Float32Array(BAR_COUNT).fill(0)

    const canvas = canvasRef.current
    if (!canvas) return
    const cCtx = canvas.getContext('2d')
    if (!cCtx) return

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      const W = canvas.width
      const H = canvas.height
      cCtx.clearRect(0, 0, W, H)

      const gap = 3
      const barWidth = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT

      for (let i = 0; i < BAR_COUNT; i++) {
        const bin = Math.round(startBin + i * binStep)
        const raw = dataArray[bin] / 255

        // Light smoothing: 70% current value, 30% previous
        smoothedRef.current![i] = raw * 0.7 + smoothedRef.current![i] * 0.3
        const value = smoothedRef.current![i]

        const barH = Math.max(3, value * H)
        const x = i * (barWidth + gap)
        const y = (H - barH) / 2

        const alpha = 0.15 + value * 0.85
        cCtx.fillStyle = color
        cCtx.globalAlpha = alpha
        cCtx.beginPath()
        cCtx.roundRect(x, y, barWidth, barH, barWidth / 2)
        cCtx.fill()
      }
      cCtx.globalAlpha = 1
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      document.removeEventListener('pointerdown', tryResume)
      source.disconnect()
      if (ctx.state !== 'closed') ctx.close().catch(() => {})
    }
  }, [stream, isActive, color])

  return (
    <canvas
      ref={canvasRef}
      width={140}
      height={40}
    />
  )
}

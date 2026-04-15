import { useEffect, useRef } from 'react'

// Consistent with useVoiceRecorder — both use time-domain RMS now.
// The old code used getByteFrequencyData here but getByteTimeDomainData in the VAD,
// which meant thresholds were calibrated for completely different scales.
// Frequency data: 0-255 representing dB per spectral bin (very sensitive to noise)
// Time-domain RMS: actual waveform amplitude (what we actually want)
const BARGE_IN_RMS_THRESHOLD = 18     // RMS units — tuned to match VAD scale
const DEAF_WINDOW_MS = 600            // slightly longer than before — echo cancellation
// needs a beat to calibrate after TTS starts
const CHECK_INTERVAL_MS = 80
const SUSTAIN_CHECKS = 3              // ~240ms of sustained speech before triggering
// (was 2 = 160ms — too easy to false-trigger)

interface UseBargeinOptions {
  enabled: boolean
  onBargeIn: () => void
}

/**
 * Keeps a "hot" mic stream running while the AI is speaking.
 * Listens for sustained RMS above threshold and calls onBargeIn().
 * Uses the same time-domain RMS calculation as useVoiceRecorder for consistency.
 */
export function useBargein({ enabled, onBargeIn }: UseBargeinOptions) {
  const onBargeInRef = useRef(onBargeIn)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onBargeInRef.current = onBargeIn
  }, [onBargeIn])

  useEffect(() => {
    if (!enabled) {
      cleanupRef.current?.()
      cleanupRef.current = null
      return
    }

    let active = true
    let intervalId: ReturnType<typeof setInterval> | null = null
    let audioCtx: AudioContext | null = null
    let sustained = 0
    const startTime = Date.now()

      ; (async () => {
        try {
          const ambientStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false, // raw levels needed for threshold detection
            },
          })

          if (!active) {
            ambientStream.getTracks().forEach(t => t.stop())
            return
          }

          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
          audioCtx = new AudioCtxClass()

          // Resume if suspended (iOS Safari always starts AudioContext suspended)
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume()
          }

          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 256
          const source = audioCtx.createMediaStreamSource(ambientStream)
          source.connect(analyser)

          // Time-domain buffer — consistent with useVoiceRecorder
          const dataArray = new Uint8Array(analyser.frequencyBinCount)

          const doCleanup = () => {
            active = false
            if (intervalId) { clearInterval(intervalId); intervalId = null }
            ambientStream.getTracks().forEach(t => t.stop())
            if (audioCtx && audioCtx.state !== 'closed') {
              audioCtx.close().catch(() => { })
            }
            audioCtx = null
          }

          cleanupRef.current = doCleanup

          intervalId = setInterval(() => {
            if (!active) return
            if (Date.now() - startTime < DEAF_WINDOW_MS) return

            // Time-domain RMS — same calculation as useVoiceRecorder VAD
            analyser.getByteTimeDomainData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) {
              const amplitude = dataArray[i] - 128
              sum += amplitude * amplitude
            }
            const rms = Math.sqrt(sum / dataArray.length)

            if (rms > BARGE_IN_RMS_THRESHOLD) {
              sustained++
              if (sustained >= SUSTAIN_CHECKS) {
                // Confirmed barge-in — clean up first, then fire callback.
                // The setTimeout(0) yields to the event loop so the mic stream
                // is fully stopped before FormSession tries to open a new one.
                // Without this, iOS throws NotReadableError on the next getUserMedia.
                doCleanup()
                setTimeout(() => {
                  if (onBargeInRef.current) onBargeInRef.current()
                }, 0)
              }
            } else {
              sustained = 0
            }
          }, CHECK_INTERVAL_MS)

        } catch (err) {
          // Barge-in is a progressive enhancement — form works fine without it
          console.warn('[Barge-in] Could not open ambient stream:', err)
        }
      })()

    return () => {
      active = false
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [enabled])
}
import { useEffect, useRef } from 'react'

const BARGE_IN_THRESHOLD = 40   // must be louder than ambient (out of 255)
const DEAF_WINDOW_MS = 500      // ignore first 500ms (echo cancellation calibration)
const CHECK_INTERVAL_MS = 80    // check every 80ms
const SUSTAIN_CHECKS = 2        // must sustain for 2 consecutive ticks (~160ms)

interface UseBargeinOptions {
  enabled: boolean
  onBargeIn: () => void
}

/**
 * Keeps a "hot" mic stream running while the AI is speaking.
 * If a sustained volume spike is detected (and we're past the deaf window),
 * calls onBargeIn() so FormSession can cancel TTS and start recording.
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

    ;(async () => {
      try {
        // Open a dedicated ambient stream with full hardware echo cancellation
        const ambientStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, // keep raw levels for threshold detection
          },
        })

        if (!active) {
          ambientStream.getTracks().forEach(t => t.stop())
          return
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
        audioCtx = new AudioCtxClass()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        const source = audioCtx.createMediaStreamSource(ambientStream)
        source.connect(analyser)

        const data = new Uint8Array(analyser.frequencyBinCount)

        intervalId = setInterval(() => {
          if (!active) return

          // Deaf window: ignore first 500ms so echo cancellation can calibrate
          if (Date.now() - startTime < DEAF_WINDOW_MS) return

          analyser.getByteFrequencyData(data)
          const maxVol = Math.max(...Array.from(data))

          if (maxVol > BARGE_IN_THRESHOLD) {
            sustained++
            if (sustained >= SUSTAIN_CHECKS) {
              // Confirmed barge-in — fire and tear down
              active = false
              if (cleanupRef.current) cleanupRef.current()
              onBargeInRef.current()
            }
          } else {
            sustained = 0
          }
        }, CHECK_INTERVAL_MS)

        cleanupRef.current = () => {
          active = false
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
          ambientStream.getTracks().forEach(t => t.stop())
          if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => {})
          }
          audioCtx = null
        }
      } catch (err) {
        // Silently fail — barge-in is a progressive enhancement
        // The form still works without it
        console.warn('[Barge-in] Could not open ambient mic stream:', err)
      }
    })()

    return () => {
      active = false
      if (cleanupRef.current) cleanupRef.current()
      cleanupRef.current = null
    }
  }, [enabled])
}

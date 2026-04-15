import { useState, useRef, useCallback, useEffect } from 'react'

// --- VAD Constants ---
// Tightened from 3500ms → 1800ms. 3.5s felt broken; 1.8s is snappy but
// still forgiving enough for natural speech pauses mid-sentence.
const SILENCE_THRESHOLD = 12          // baseline floor (RMS out of ~128)
const MAX_SILENCE_MS = 1800           // 1.8s pause → auto-stop
const VAD_INTERVAL_MS = 80            // check every 80ms (was 100ms, slightly more responsive)
const NOISE_CALIBRATION_MS = 600      // first 600ms = ambient noise sampling
// Multiplier reduced from 1.5 → 1.25. 1.5 was too generous in noisy environments
// (fans, AC, street noise) — it pushed the floor so high that normal speech
// barely crossed it, making the silence timer never reset properly.
const FLOOR_MULTIPLIER = 1.25
const FLOOR_MAX = 32                  // hard cap — prevents runaway floor in very noisy rooms

export function useVoiceRecorder(
  onTranscription: (text: string, audioBlob: Blob) => void,
  formId: string,
) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])
  const micStreamRef = useRef<MediaStream | null>(null)

  // VAD refs
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vadAudioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef(0)
  const noiseFloorRef = useRef(SILENCE_THRESHOLD)
  const calibrationSamplesRef = useRef<number[]>([])
  const calibrationDoneRef = useRef(false)
  const calibrationTicksRef = useRef(0)

  // Keep callback ref stable so startRecording useCallback doesn't need it as dep
  const onTranscriptionRef = useRef(onTranscription)
  useEffect(() => {
    onTranscriptionRef.current = onTranscription
  }, [onTranscription])

  const clearVAD = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (vadAudioCtxRef.current) {
      if (vadAudioCtxRef.current.state !== 'closed') {
        vadAudioCtxRef.current.close().catch(() => { })
      }
      vadAudioCtxRef.current = null
    }
  }, [])

  const stopRecording = useCallback(() => {
    clearVAD()
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
  }, [clearVAD])

  const startRecording = useCallback(async () => {
    // Clean up any lingering stream from a previous session
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Don't force 16kHz here — let the browser pick its native rate.
          // Forcing 16kHz on some iOS/Android devices causes getUserMedia to reject
          // the constraint entirely rather than falling back gracefully.
          // Google STT and Groq Whisper both handle any sample rate fine.
        },
      })

      micStreamRef.current = micStream

      // MIME type detection — critical for iOS Safari which only supports audio/mp4
      // Test in order of quality preference
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(type => MediaRecorder.isTypeSupported(type)) ?? ''

      mediaRecorder.current = new MediaRecorder(
        micStream,
        mimeType ? { mimeType } : undefined, // don't pass empty string — let browser decide
      )
      audioChunks.current = []

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      mediaRecorder.current.onstop = async () => {
        clearVAD()
        const finalMime = mediaRecorder.current?.mimeType || mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunks.current, { type: finalMime })
        setIsRecording(false)
        setStream(null)
        setIsProcessing(true)

        try {
          const formData = new FormData()
          // Use the correct extension based on MIME type so Google STT/Groq can parse it
          const ext = finalMime.includes('mp4') ? 'mp4'
            : finalMime.includes('ogg') ? 'ogg'
              : 'webm'
          formData.append('audio', audioBlob, `recording.${ext}`)
          formData.append('formId', formId)
          formData.append('mimeType', finalMime)

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error)

          onTranscriptionRef.current(data.transcript || '', audioBlob)
        } catch (e: any) {
          setError(e.message)
          console.error('Transcription failed:', e)
          // Still call onTranscription with empty string so UI can handle the error gracefully
          onTranscriptionRef.current('', new Blob())
        } finally {
          setIsProcessing(false)
          micStream.getTracks().forEach(track => track.stop())
          micStreamRef.current = null
        }
      }

      // Request data every 250ms instead of waiting for stop — ensures we get
      // chunks even if the browser delays the final ondataavailable event
      mediaRecorder.current.start(250)
      setIsRecording(true)
      setStream(micStream)
      setError(null)

      // --- VAD Setup ---
      silenceTimerRef.current = 0
      noiseFloorRef.current = SILENCE_THRESHOLD
      calibrationSamplesRef.current = []
      calibrationDoneRef.current = false
      calibrationTicksRef.current = 0

      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtxClass) throw new Error('No AudioContext')

        // On iOS Safari, AudioContext starts in 'suspended' state.
        // We resume it here — this is safe because startRecording is always
        // called from a direct user gesture (button tap).
        const audioCtx = new AudioCtxClass()
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume()
        }
        vadAudioCtxRef.current = audioCtx

        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        const source = audioCtx.createMediaStreamSource(micStream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const calibrationTicks = Math.ceil(NOISE_CALIBRATION_MS / VAD_INTERVAL_MS)

        vadIntervalRef.current = setInterval(() => {
          if (!mediaRecorder.current || mediaRecorder.current.state === 'inactive') {
            clearVAD()
            return
          }

          // Time-domain RMS — consistent with useBargein, avoids frequency bin confusion
          analyser.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const amplitude = dataArray[i] - 128 // 128 = zero-crossing for 8-bit PCM
            sum += amplitude * amplitude
          }
          const currentVol = Math.sqrt(sum / dataArray.length)

          // Phase 1: Calibrate noise floor for first NOISE_CALIBRATION_MS
          if (!calibrationDoneRef.current) {
            calibrationTicksRef.current++
            // Skip tick 1 — first read is often noisy (mic just opened)
            if (calibrationTicksRef.current > 1) {
              calibrationSamplesRef.current.push(currentVol)
            }
            if (calibrationTicksRef.current >= calibrationTicks) {
              const samples = calibrationSamplesRef.current
              const ambientMax = samples.length
                ? samples.reduce((a, b) => Math.max(a, b), 0)
                : 0
              noiseFloorRef.current = Math.min(
                Math.max(SILENCE_THRESHOLD, ambientMax * FLOOR_MULTIPLIER),
                FLOOR_MAX,
              )
              calibrationDoneRef.current = true
              console.debug(`[VAD] Noise floor: ${noiseFloorRef.current.toFixed(2)} (ambient peak: ${ambientMax.toFixed(2)})`)
            }
            return
          }

          // Phase 2: Silence detection
          if (currentVol < noiseFloorRef.current) {
            silenceTimerRef.current += VAD_INTERVAL_MS
            if (silenceTimerRef.current >= MAX_SILENCE_MS) {
              console.debug('[VAD] Silence detected — stopping')
              stopRecording()
            }
          } else {
            silenceTimerRef.current = 0
          }
        }, VAD_INTERVAL_MS)

      } catch (vadErr) {
        // VAD failing silently is acceptable — manual stop button always works
        console.warn('[VAD] Unavailable, manual stop only:', vadErr)
      }

    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError('Microphone permission denied. Please allow mic access and try again.')
      } else if (e.name === 'NotFoundError') {
        setError('No microphone found on this device.')
      } else if (e.name === 'NotReadableError') {
        setError('Microphone is in use by another app.')
      } else {
        setError('Could not access microphone.')
      }
      console.error('[Recorder] getUserMedia failed:', e)
    }
  }, [formId, clearVAD, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearVAD()
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [clearVAD])

  return { startRecording, stopRecording, isRecording, isProcessing, error, stream }
}
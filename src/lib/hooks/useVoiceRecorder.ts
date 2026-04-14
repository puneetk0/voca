import { useState, useRef, useCallback, useEffect } from 'react'

// VAD constants
const SILENCE_THRESHOLD = 15       // absolute min vol (out of 255)
const MAX_SILENCE_MS = 2500        // 2.5s generous pause before auto-stop
const VAD_INTERVAL_MS = 100        // check every 100ms
const NOISE_CALIBRATION_MS = 500   // first 500ms = noise floor sampling

export function useVoiceRecorder(onTranscription: (text: string, audioBlob: Blob) => void, formId: string) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])

  // VAD refs
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vadAudioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef(0)
  const noiseFloorRef = useRef(SILENCE_THRESHOLD)
  const calibrationSamplesRef = useRef<number[]>([])
  const calibrationDoneRef = useRef(false)
  const calibrationTicksRef = useRef(0)

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
        vadAudioCtxRef.current.close().catch(() => {})
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
    try {
      // echoCancellation + noiseSuppression = required for barge-in (4.2) and clean VAD
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })

      // Determine MIME type (iOS Safari fallback)
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4'
      }

      mediaRecorder.current = new MediaRecorder(micStream, { mimeType })
      audioChunks.current = []

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }

      mediaRecorder.current.onstop = async () => {
        clearVAD()
        const audioBlob = new Blob(audioChunks.current, { type: mimeType })
        setIsRecording(false)
        setStream(null)
        setIsProcessing(true)

        try {
          const formData = new FormData()
          formData.append('audio', audioBlob)
          formData.append('formId', formId)

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error)

          // Always pass the transcript (even if empty) so the UI guardrail can catch it
          onTranscriptionRef.current(data.transcript || '', audioBlob)
        } catch (e: any) {
          setError(e.message)
          console.error('Transcription failed:', e)
        } finally {
          setIsProcessing(false)
          micStream.getTracks().forEach((track) => track.stop())
        }
      }

      mediaRecorder.current.start()
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
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) throw new Error('No AudioContext')

        const audioCtx = new AudioContext()
        vadAudioCtxRef.current = audioCtx
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        const source = audioCtx.createMediaStreamSource(micStream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const calibrationTicks = NOISE_CALIBRATION_MS / VAD_INTERVAL_MS // = 5

        vadIntervalRef.current = setInterval(() => {
          // Stop if MediaRecorder is no longer active
          if (!mediaRecorder.current || mediaRecorder.current.state === 'inactive') {
            clearVAD()
            return
          }

          analyser.getByteFrequencyData(dataArray)
          const maxVol = Math.max(...Array.from(dataArray))

          // Phase 1: Calibrate noise floor for first 500ms
          // Ignore the very first tick to avoid counting the hardware 'click' sound
          if (!calibrationDoneRef.current) {
            calibrationTicksRef.current++
            if (calibrationTicksRef.current > 1) {
               calibrationSamplesRef.current.push(maxVol)
            }

            if (calibrationTicksRef.current >= calibrationTicks) {
              // Set noise floor = 130% of max ambient noise, capped at 50 to avoid deafening the VAD
              const ambientMax = calibrationSamplesRef.current.length ? Math.max(...calibrationSamplesRef.current) : 0
              noiseFloorRef.current = Math.min(Math.max(SILENCE_THRESHOLD, Math.round(ambientMax * 1.3)), 50)
              calibrationDoneRef.current = true
              console.debug(`[VAD] Noise floor calibrated: ${noiseFloorRef.current}`)
            }
            return // don't start silence timer during calibration
          }

          // Phase 2: Silence detection
          const isSilence = maxVol < noiseFloorRef.current
          if (isSilence) {
            silenceTimerRef.current += VAD_INTERVAL_MS
            if (silenceTimerRef.current >= MAX_SILENCE_MS) {
              console.debug('[VAD] Silence detected — auto-stopping recording')
              stopRecording() // This internally calls clearVAD
            }
          } else {
            silenceTimerRef.current = 0 // reset on any voice
          }
        }, VAD_INTERVAL_MS)
      } catch (vadErr) {
        console.warn('[VAD] Audio analysis unavailable, manual stop only:', vadErr)
        // VAD silently fails — manual stop button remains as fallback
      }
    } catch (e: any) {
      setError('Microphone access denied or unavailable.')
      console.error('Mic error:', e)
    }
  }, [formId, clearVAD, stopRecording])

  return { startRecording, stopRecording, isRecording, isProcessing, error, stream }
}

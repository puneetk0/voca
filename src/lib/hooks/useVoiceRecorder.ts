import { useState, useRef, useCallback, useEffect } from 'react'

// --- VAD Constants ---
const SILENCE_THRESHOLD = 10       // absolute minimum noise floor
const MAX_SILENCE_MS = 1600        // pause length that ends the answer (snappy turn-taking)
const VAD_INTERVAL_MS = 80
const NOISE_CALIBRATION_MS = 600
const FLOOR_MULTIPLIER = 1.4       // applied to the ambient MEDIAN (not max — max over-calibrates)
const FLOOR_MAX = 24               // never let a noisy calibration eat quiet speech
const MIN_SPEECH_BEFORE_CUTOFF_MS = 700
// Relative silence: once the user has spoken, "silence" is anything quieter
// than a fraction of THEIR observed speech peak — robust across mic gains.
const PEAK_SILENCE_RATIO = 0.25
// Failsafes — the mic must NEVER record forever:
const NO_SPEECH_TIMEOUT_MS = 8000  // nothing heard → stop, let the empty-capture reprompt run
const MAX_RECORDING_MS = 45000     // hard cap → stop and transcribe what we have

export function useVoiceRecorder(
  onTranscription: (text: string, audioBlob: Blob, confidence: number) => void,
  formId: string,
) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  // vadVolume: 0–1 normalised amplitude above the calibrated noise floor.
  // Only > 0 when human speech is detected — drives waveform visibility.
  const [vadVolume, setVadVolume] = useState(0)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<BlobPart[]>([])
  const micStreamRef = useRef<MediaStream | null>(null)
  const shouldIgnoreNextStopRef = useRef(false)

  // VAD refs
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vadAudioCtxRef = useRef<AudioContext | null>(null)
  const silenceTimerRef = useRef(0)
  const speechDurationRef = useRef(0)
  const speechPeakRef = useRef(0)
  const elapsedMsRef = useRef(0)
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

  const stopRecording = useCallback((ignoreTranscription = false) => {
    clearVAD()
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      if (ignoreTranscription) shouldIgnoreNextStopRef.current = true
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
        const wasIgnored = shouldIgnoreNextStopRef.current
        shouldIgnoreNextStopRef.current = false

        setIsRecording(false)
        setStream(null)

        if (wasIgnored) {
          setIsProcessing(false)
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop())
            micStreamRef.current = null
          }
          return
        }

        const finalMime = mediaRecorder.current?.mimeType || mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunks.current, { type: finalMime })
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

          onTranscriptionRef.current(data.transcript || '', audioBlob, data.confidence || 1.0)
        } catch (e: any) {
          setError(e.message)
          console.error('Transcription failed:', e)
          // Still call onTranscription with empty string so UI can handle the error gracefully
          onTranscriptionRef.current('', new Blob(), 0)
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
      speechDurationRef.current = 0
      speechPeakRef.current = 0
      elapsedMsRef.current = 0
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

          elapsedMsRef.current += VAD_INTERVAL_MS

          // FAILSAFE 1: never record forever — hard cap, transcribe what we have.
          if (elapsedMsRef.current >= MAX_RECORDING_MS) {
            console.warn('[VAD] Max recording duration reached — stopping')
            stopRecording()
            return
          }
          // FAILSAFE 2: nothing heard at all — stop; the empty-transcript
          // path replays the question and hints at the text input.
          if (speechDurationRef.current === 0 && elapsedMsRef.current >= NO_SPEECH_TIMEOUT_MS) {
            console.debug('[VAD] No speech detected — stopping')
            stopRecording()
            return
          }

          // Time-domain RMS — avoids frequency bin confusion
          analyser.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const amplitude = dataArray[i] - 128 // 128 = zero-crossing for 8-bit PCM
            sum += amplitude * amplitude
          }
          const currentVol = Math.sqrt(sum / dataArray.length)

          // Phase 1: Calibrate noise floor for first NOISE_CALIBRATION_MS.
          // MEDIAN of ambient samples — a single cough/click during calibration
          // must not raise the floor above quiet speech (the old max-based
          // floor caused "never auto-stops" for soft speakers).
          if (!calibrationDoneRef.current) {
            calibrationTicksRef.current++
            // Skip tick 1 — first read is often noisy (mic just opened)
            if (calibrationTicksRef.current > 1) {
              calibrationSamplesRef.current.push(currentVol)
            }
            if (calibrationTicksRef.current >= calibrationTicks) {
              const samples = [...calibrationSamplesRef.current].sort((a, b) => a - b)
              const ambientMedian = samples.length ? samples[Math.floor(samples.length / 2)] : 0
              noiseFloorRef.current = Math.min(
                Math.max(SILENCE_THRESHOLD, ambientMedian * FLOOR_MULTIPLIER),
                FLOOR_MAX,
              )
              calibrationDoneRef.current = true
              console.debug(`[VAD] Noise floor: ${noiseFloorRef.current.toFixed(2)} (ambient median: ${ambientMedian.toFixed(2)})`)
            }
            return
          }

          // Phase 2: Silence detection + expose normalised volume for waveform.
          // Once the user has spoken, "silence" is relative to THEIR speech
          // peak — robust across quiet mics and loud rooms.
          const silenceCutoff = speechPeakRef.current > 0
            ? Math.max(noiseFloorRef.current, speechPeakRef.current * PEAK_SILENCE_RATIO)
            : noiseFloorRef.current

          if (currentVol < silenceCutoff) {
            setVadVolume(0)
            // Only count silence toward cutoff once user has actually spoken for a bit.
            // This prevents cutting off someone who pauses before starting their answer.
            if (speechDurationRef.current >= MIN_SPEECH_BEFORE_CUTOFF_MS) {
              silenceTimerRef.current += VAD_INTERVAL_MS
              if (silenceTimerRef.current >= MAX_SILENCE_MS) {
                console.debug('[VAD] Silence detected — stopping')
                // VAD proved itself: the "tap when done" hint can stay hidden.
                try { localStorage.setItem('voca_vad_ok', '1') } catch { }
                stopRecording()
              }
            }
          } else {
            silenceTimerRef.current = 0
            speechDurationRef.current += VAD_INTERVAL_MS
            speechPeakRef.current = Math.max(speechPeakRef.current, currentVol)
            // Normalize: 0 at noise floor, 1 at 4× floor (typical speech peak)
            const normalised = Math.min((currentVol - noiseFloorRef.current) / (noiseFloorRef.current * 3), 1)
            setVadVolume(normalised)
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

  return { startRecording, stopRecording, isRecording, isProcessing, error, stream, vadVolume }
}
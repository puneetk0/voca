import { useState, useRef, useCallback, useEffect } from 'react'

// --- Mic level metering ---
// The mic stays open until the user taps the orb to stop — there is NO
// automatic silence cutoff. The analyser loop below is kept purely to drive
// the live waveform (vadVolume), not to end the turn.
const SILENCE_THRESHOLD = 10       // absolute minimum noise floor
const VAD_INTERVAL_MS = 80
const NOISE_CALIBRATION_MS = 600
const FLOOR_MULTIPLIER = 1.4       // applied to the ambient MEDIAN (not max — max over-calibrates)
const FLOOR_MAX = 24               // never let a noisy calibration eat quiet speech
// Waveform gate: below a fraction of the user's own speech peak reads as "quiet"
// (shows a flat waveform). Metering only — it no longer ends the turn.
const PEAK_SILENCE_RATIO = 0.25
// Single failsafe so a walked-away mic can't record (and upload) forever.
// 90s comfortably covers any real spoken answer while capping the Sarvam STT
// bill (billed by audio length) for an abandoned or dead-open mic — 3 min was
// needlessly expensive.
const MAX_RECORDING_MS = 90000     // 90s hard cap → stop and transcribe what we have

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
  // ONE persistent mic stream for the whole session. Re-acquiring getUserMedia
  // per question made mobile browsers re-prompt for permission every single
  // question and added visible latency — now we grab it once and reuse it.
  const micStreamRef = useRef<MediaStream | null>(null)
  const shouldIgnoreNextStopRef = useRef(false)
  // Reentrancy guard: two overlapping startRecording calls (rapid orb taps)
  // used to run two live recorders sharing one chunk buffer — corrupted audio
  // and a leaked mic stream.
  const isStartingRef = useRef(false)
  // Abort epoch: stopRecording(true) bumps it, which also voids any
  // transcription ALREADY in flight (the old flag only worked pre-stop).
  const epochRef = useRef(0)

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

  // Dead-stream detection. On mobile (esp. iOS Safari), playing TTS switches
  // the audio session and can silently kill/mute the held mic stream — it then
  // delivers pure digital silence forever and only a FRESH getUserMedia brings
  // the mic back. We detect "no signal at all" early in a recording and
  // transparently re-acquire + restart. Guardrails: the check only runs when
  // the analyser context was running from the start (a suspended context also
  // reads zeros and must not trigger false recoveries), and at most 2
  // recoveries per page before surfacing a clear error.
  const peakEverRef = useRef(0)
  const deadCheckDoneRef = useRef(false)
  const ctxRunningEarlyRef = useRef<number | null>(null)
  const deadStreamRecoveriesRef = useRef(0)
  const gestureResumeHandlerRef = useRef<(() => void) | null>(null)
  // Self-reference so the dead-stream recovery can restart recording from
  // inside the VAD interval without a circular useCallback dependency.
  const startRecordingRef = useRef<(() => void) | null>(null)

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
    if (gestureResumeHandlerRef.current) {
      document.removeEventListener('pointerdown', gestureResumeHandlerRef.current)
      gestureResumeHandlerRef.current = null
    }
  }, [])

  const stopRecording = useCallback((ignoreTranscription = false) => {
    clearVAD()
    if (ignoreTranscription) {
      // Void this capture AND any transcription already in flight.
      shouldIgnoreNextStopRef.current = true
      epochRef.current++
    }
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
  }, [clearVAD])

  // Acquire the mic once and reuse it — BUT revalidate before every use.
  // On mobile, TTS playback switches the audio session and can leave the held
  // stream muted for good; a muted stream records pure silence. If the cached
  // track is muted and doesn't come back within ~1.2s, discard it and acquire
  // a FRESH stream (permission is already granted, so this is promptless).
  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    const existing = micStreamRef.current
    if (existing) {
      const track = existing.getAudioTracks()[0]
      if (track && track.readyState === 'live') {
        if (track.muted) {
          await new Promise<void>(resolve => {
            let done = false
            const finish = () => {
              if (done) return
              done = true
              track.removeEventListener('unmute', finish)
              resolve()
            }
            track.addEventListener('unmute', finish)
            setTimeout(finish, 1200)
          })
        }
        if (!track.muted) return existing
        console.warn('[Recorder] held mic stream stayed muted — re-acquiring fresh stream')
      }
      existing.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // Don't force 16kHz here — let the browser pick its native rate.
        // Forcing 16kHz on some iOS/Android devices causes getUserMedia to reject
        // the constraint entirely rather than falling back gracefully.
      },
    })
    micStreamRef.current = micStream
    return micStream
  }, [])

  // Force a fresh mic on the NEXT recording. Called after a capture comes back
  // empty — a mic silently killed by the mobile audio-session switch keeps
  // reporting a live track but delivers silence forever; only re-acquisition
  // brings it back. (Permission is already granted, so this is normally
  // promptless.)
  const resetStream = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
    }
  }, [])

  // A freshly-granted mic track can start `muted` and only unmute once the
  // hardware warms up (notably iOS Safari) — recording during that window
  // captures pure silence (the "waveform not moving / said my name but nothing
  // recorded, reload fixed it" report). Wait for real audio before recording.
  const waitUntilAudible = useCallback(async (stream: MediaStream) => {
    const track = stream.getAudioTracks()[0]
    if (!track || !track.muted) return
    await new Promise<void>(resolve => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        track.removeEventListener('unmute', finish)
        resolve()
      }
      track.addEventListener('unmute', finish)
      setTimeout(finish, 2500) // never block forever
    })
  }, [])

  // Prime the mic ahead of the first question (single prompt at session start).
  // Throws on denial so the caller can show a helpful message. Kicks off the
  // hardware warm-up early so it's audible by the time recording begins.
  const primeMic = useCallback(async () => {
    const s = await ensureStream()
    waitUntilAudible(s).catch(() => {})
  }, [ensureStream, waitUntilAudible])

  const startRecording = useCallback(async () => {
    // Reentrancy guard — a second call while one recorder is starting or live
    // must be a no-op, not a parallel recorder.
    if (isStartingRef.current) return
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') return
    isStartingRef.current = true

    try {
      const micStream = await ensureStream()
      // Don't record into a still-warming (muted) mic — capture silence otherwise.
      await waitUntilAudible(micStream)

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
        // Capture the epoch: if a barge-in voids this capture while the
        // transcription request is still in flight, we drop its result.
        const epoch = epochRef.current

        setIsRecording(false)
        setStream(null)

        if (wasIgnored) {
          setIsProcessing(false)
          // Keep the persistent stream alive — it's reused for the next question.
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

          // Hard timeout — without it a stalled mobile connection left this
          // fetch pending forever, freezing the orb in the 'transcribing'
          // state with no way out (the reported "stuck orb" at a question).
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(25000),
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error)

          // Stale result (a barge-in superseded this capture) — drop silently.
          if (epoch !== epochRef.current) return

          onTranscriptionRef.current(data.transcript || '', audioBlob, data.confidence || 1.0)
        } catch (e: any) {
          if (epoch !== epochRef.current) return
          setError(e.message)
          console.error('Transcription failed:', e)
          // Still call onTranscription with empty string so UI can handle the error gracefully
          onTranscriptionRef.current('', new Blob(), 0)
        } finally {
          setIsProcessing(false)
          // Persistent stream stays open for the next question — released only
          // on unmount. This is what stops the per-question permission prompt.
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
      peakEverRef.current = 0
      deadCheckDoneRef.current = false
      ctxRunningEarlyRef.current = null

      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtxClass) throw new Error('No AudioContext')

        // Recording often starts OUTSIDE a user gesture now (after TTS ends),
        // where iOS keeps a new AudioContext 'suspended' and resume() doesn't
        // stick. Try immediately, and also hook the next tap anywhere on the
        // page (the user taps the orb to stop anyway) as a gesture-context
        // resume so the meter reliably comes alive.
        const audioCtx = new AudioCtxClass()
        const tryResume = () => { if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { }) }
        tryResume()
        document.addEventListener('pointerdown', tryResume)
        gestureResumeHandlerRef.current = tryResume
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

          // Only failsafe: never record forever — hard cap, transcribe what we
          // have. Otherwise the mic stays open until the user taps to stop.
          if (elapsedMsRef.current >= MAX_RECORDING_MS) {
            console.warn('[VAD] Max recording duration reached — stopping')
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
          peakEverRef.current = Math.max(peakEverRef.current, currentVol)

          // Note when the analyser context first reported 'running' — its
          // readings are only meaningful from then on (a suspended context
          // reads all-zeros, which must never be mistaken for a dead mic).
          if (ctxRunningEarlyRef.current === null && audioCtx.state === 'running') {
            ctxRunningEarlyRef.current = elapsedMsRef.current
          }

          // DEAD-STREAM WATCHDOG: a live mic always emits at least occasional
          // ±1 quantization noise across 1.8s of frames; a stream killed by
          // the mobile audio-session switch reads EXACTLY zero forever and
          // will never transcribe. Pure digital zero — measured by a context
          // that was running from (near) the start — means the stream is
          // dead: void this capture, drop the stream, restart with a fresh
          // one. Threshold is intentionally near-zero so noise suppression in
          // a dead-quiet room can never false-trigger.
          if (
            !deadCheckDoneRef.current &&
            elapsedMsRef.current >= 1760 &&
            ctxRunningEarlyRef.current !== null &&
            ctxRunningEarlyRef.current <= 400
          ) {
            deadCheckDoneRef.current = true
            if (peakEverRef.current < 0.05) {
              if (deadStreamRecoveriesRef.current < 2) {
                deadStreamRecoveriesRef.current++
                console.warn('[VAD] mic stream delivering digital silence — re-acquiring and restarting')
                stopRecording(true) // void the silent capture
                if (micStreamRef.current) {
                  micStreamRef.current.getTracks().forEach(t => t.stop())
                  micStreamRef.current = null
                }
                setTimeout(() => startRecordingRef.current?.(), 60)
              } else {
                setError('Your microphone seems muted. Check the mic switch or permissions — or just type your answer below.')
                stopRecording(true)
              }
              return
            }
            // Healthy signal observed — this page's mic works; stop counting
            // earlier recoveries against the cap.
            deadStreamRecoveriesRef.current = 0
          }

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

          // Phase 2: expose normalised volume for the live waveform ONLY.
          // No silence cutoff — the turn ends when the user taps the orb.
          // "Quiet" is relative to the user's own speech peak, robust to mic gain.
          const silenceCutoff = speechPeakRef.current > 0
            ? Math.max(noiseFloorRef.current, speechPeakRef.current * PEAK_SILENCE_RATIO)
            : noiseFloorRef.current

          if (currentVol < silenceCutoff) {
            setVadVolume(0)
          } else {
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
    } finally {
      isStartingRef.current = false
    }
  }, [formId, clearVAD, ensureStream, waitUntilAudible])

  // Keep the self-reference fresh for the dead-stream recovery restart.
  useEffect(() => { startRecordingRef.current = startRecording }, [startRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearVAD()
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [clearVAD])

  return { startRecording, stopRecording, primeMic, resetStream, isRecording, isProcessing, error, stream, vadVolume }
}
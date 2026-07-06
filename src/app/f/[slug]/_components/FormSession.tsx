'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useConversationStore } from '@/lib/store/conversation'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Send, Square, WifiOff, CheckCircle2 } from 'lucide-react'
import { submitResponse } from '@/lib/actions/submit'
import { useVoiceRecorder } from '@/lib/hooks/useVoiceRecorder'
import { useTTS, type VoiceState } from '@/lib/hooks/useTTS'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import ReviewScreen from './ReviewScreen'
import SuccessScreen from './SuccessScreen'
import Waveform from '@/components/voice/Waveform'
import { ConfirmationPill } from '@/components/form/ConfirmationPill'
import { parseDevice } from '@/lib/device'
import { startFormSession, updateSessionProgress } from '@/lib/actions/sessions'
import { mapErrorToUi, type ApiErrorCode } from '@/lib/api-errors'
import { computePath, projectedTotal, onPathFieldIds, type BranchField } from '@/lib/branching'

const GHOST_MESSAGES = [
  'Taking a moment, bear with me.',
  'Processing that, just a second.',
  'Almost there, one moment.',
]

// 44-byte silent WAV: playing it inside a user gesture (or a permitted
// autoplay) unlocks the audio element for all later TTS playback.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

// Generous budget: the server's worst case is ~8-12s (capped provider
// timeouts). Aborting earlier only wastes the in-flight work and burns
// rate limits with duplicate requests.
const CONVERSE_TIMEOUT_MS = 15000
const SLOW_HINT_MS = 4000

/** One in-flight converse turn. `userAborted` distinguishes an intentional
 *  cancel (correction pill / newer input) from a timeout abort. */
type ConverseTurn = { controller: AbortController; userAborted: boolean }

type ConverseResult = {
  data?: any
  timedOut?: boolean
  aborted?: boolean
  error?: string
  code?: ApiErrorCode
}

/** Fetch /api/converse with a hard timeout and a "this is slow" callback. */
async function fetchConverse(body: object, turn: ConverseTurn, onSlow?: () => void): Promise<ConverseResult> {
  const timer = setTimeout(() => turn.controller.abort(), CONVERSE_TIMEOUT_MS)
  const slowTimer = onSlow ? setTimeout(onSlow, SLOW_HINT_MS) : null
  try {
    const res = await fetch('/api/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: turn.controller.signal,
    })
    let data: any
    try {
      data = await res.json()
    } catch {
      // Non-JSON body (proxy 504 pages etc.) — treat as provider failure
      return { error: 'Bad gateway', code: 'upstream_down' }
    }
    if (!res.ok) return { error: data.error || 'API error', code: data.code as ApiErrorCode | undefined }
    return { data }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return turn.userAborted ? { aborted: true } : { timedOut: true }
    }
    return { error: err.message, code: 'upstream_down' }
  } finally {
    clearTimeout(timer)
    if (slowTimer) clearTimeout(slowTimer)
  }
}

export default function FormSession({
  form,
  fields,
  prefills = {},
  userEmail,
  isPreview = false,
}: {
  form: any
  fields: any[]
  prefills?: Record<string, string>
  userEmail?: string
  isPreview?: boolean
}) {
  const store = useConversationStore()
  const [inputText, setInputText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [submissionTime, setSubmissionTime] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  // Session language starts from the form's configured default (English unless
  // the creator chose Hindi); the respondent can still toggle on the choice screen.
  const defaultLang: 'hi' | 'en' = form.default_language === 'hi' ? 'hi' : 'en'
  const [selectedLang, setSelectedLang] = useState<'hi' | 'en'>(defaultLang)
  const [showTextHint, setShowTextHint] = useState(false)
  const textInputRef = useRef<HTMLInputElement>(null)
  // Ref that mirrors voiceState — allows reading current value inside async closures
  // without stale-closure bugs (React state is always the captured render value)
  const voiceStateRef = useRef<VoiceState>('idle')

  // Session tracking (drop-off / timing / device analytics)
  const sessionIdRef = useRef<string | null>(null)
  const maxFieldReachedRef = useRef(0)

  // Direct entry: no choice screen. We auto-attempt the conversation on load;
  // if the browser blocks audio without a gesture, the orb becomes the single
  // "Tap to begin" and that tap doubles as the audio-unlock gesture.
  const [started, setStarted] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const startedRef = useRef(false)
  const autoStartRef = useRef(false)

  // Tracks the most recently confirmed answer to show between questions
  const [lastConfirmedAnswer, setLastConfirmedAnswer] = useState<{ label: string; value: string } | null>(null)
  const lastConfirmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper: show a confirmed answer pill for 3s then fade
  const showConfirmedPill = useCallback((label: string, value: string) => {
    setLastConfirmedAnswer({ label, value })
    if (lastConfirmedTimerRef.current) clearTimeout(lastConfirmedTimerRef.current)
    lastConfirmedTimerRef.current = setTimeout(() => setLastConfirmedAnswer(null), 4000)
  }, [])

  // isHandlingTranscriptRef: true while a converse call is in-flight, blocks duplicate VAD fires
  const isHandlingTranscriptRef = useRef(false)
  // Consecutive empty voice captures. Silence/noise that transcribes to nothing
  // triggers a reprompt + re-listen; without a cap that can spin into a request
  // storm (a reprompt TTS call every cycle). After a few, stop auto-listening
  // and nudge the user to type instead.
  const emptyCaptureStreakRef = useRef(0)
  const MAX_EMPTY_CAPTURES = 3

  // Turn machinery: each converse call is a numbered turn holding its own
  // AbortController. A newer turn aborts the previous one; stale resolutions
  // are discarded by comparing turn ids. Also powers the correction pill.
  const turnCounterRef = useRef(0)
  const activeConverseRef = useRef<ConverseTurn | null>(null)

  // Correction window: "You said: X" with a drain timer, shown WHILE the AI
  // processes in parallel. Resolves true (confirmed) or false (user editing).
  const [pendingTranscript, setPendingTranscript] = useState<{ text: string; fieldIndex: number; userMsgId: string } | null>(null)
  const pillResolveRef = useRef<((ok: boolean) => void) | null>(null)

  const { audioRef, fillerAudioRef, fillerFormatRef, languageRef, isSpeakingRef, captionsMode, playSmartAudio, killAudio, playChime, switchFillers } = useTTS(form.id, setVoiceState, defaultLang)


  const ANSWERS_KEY = `voca_answers_${form.id}`

  useEffect(() => {
    store.init(form.id, fields)
    store.setMode('voice') // direct entry — the choice screen is gone
    const fieldsByLabel = Object.fromEntries(
      fields.map(f => [f.label.toLowerCase().trim(), f.id])
    )
    Object.entries(prefills).forEach(([key, value]) => {
      const fieldId = fieldsByLabel[key.toLowerCase().trim()]
      if (fieldId) store.setAnswer(fieldId, value)
    })
    // Auto-fill signed-in user's email into any email-type field
    if (userEmail) {
      const emailField = fields.find(f => f.field_type === 'email')
      if (emailField) store.setAnswer(emailField.id, userEmail)
    }
    // Restore in-progress answers from localStorage (not in preview — the
    // owner's test run must not pollute real drafts)
    if (!isPreview) {
      try {
        const saved = localStorage.getItem(ANSWERS_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, string>
          Object.entries(parsed).forEach(([id, val]) => store.setAnswer(id, val))
        }
      } catch { }
    }
    return () => {
      window.speechSynthesis.cancel()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id])

  // Persist answers to localStorage on every change (skipped in preview)
  useEffect(() => {
    if (isPreview || Object.keys(store.answers).length === 0) return
    try { localStorage.setItem(ANSWERS_KEY, JSON.stringify(store.answers)) } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.answers])

  // Keep voiceStateRef in sync so async callbacks always read the current value
  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  // Track the furthest question reached, for drop-off analytics (monotonic).
  // Preview runs never create a session, so sessionIdRef stays null there.
  useEffect(() => {
    const idx = store.currentFieldIndex
    if (sessionIdRef.current && idx > maxFieldReachedRef.current) {
      maxFieldReachedRef.current = idx
      updateSessionProgress(sessionIdRef.current, idx)
    }
  }, [store.currentFieldIndex])

  // Epic 5: Track form abandonment for PostHog
  useEffect(() => {
    return () => {
      if (store.mode !== 'success') {
        try {
          if (typeof window !== 'undefined' && (window as any).posthog) {
            (window as any).posthog.capture('form_abandoned', {
              form_id: form.id,
              completed_fields: Object.keys(store.answers).length,
              total_fields: fields.length,
            })
          }
        } catch (e) { /* analytics must never crash the app */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Transient-failure toast (config errors never reach here — they render
  // the full-screen fatalError state instead).
  useEffect(() => {
    if (store.connectionLost) {
      toast.error('Hit a snag.', {
        description: 'Tap the orb to retry, or type your answer below.',
        duration: 6000,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.connectionLost])

  // Amber glow on text input when voice struggles — auto-clears after 4s and focuses input
  useEffect(() => {
    if (!showTextHint) return
    textInputRef.current?.focus()
    const timer = setTimeout(() => setShowTextHint(false), 4000)
    return () => clearTimeout(timer)
  }, [showTextHint])

  // The mic never auto-stops, so this instruction must always be visible while
  // listening. A tiny delay avoids a flash during the brief state transition.
  const [showDoneHint, setShowDoneHint] = useState(false)
  useEffect(() => {
    if (voiceState !== 'listening') { setShowDoneHint(false); return }
    const t = setTimeout(() => setShowDoneHint(true), 250)
    return () => clearTimeout(t)
  }, [voiceState])

  // Begin the conversation exactly once (auto-start or first tap).
  function beginSession() {
    if (startedRef.current) return
    startedRef.current = true
    setStarted(true)
    setNeedsTap(false)
    handleInitialSequence()
  }

  // Auto-attempt on load: if the browser lets the silent unlock play without
  // a gesture, start with zero taps; otherwise fall back to tap-to-begin.
  useEffect(() => {
    if (autoStartRef.current) return
    autoStartRef.current = true
    if (!audioRef.current) audioRef.current = new Audio()
    const a = audioRef.current
    a.src = SILENT_WAV
    a.play()
      .then(() => { a.src = ''; beginSession() })
      .catch(() => { a.src = ''; setNeedsTap(true) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Optimistic thinking label shown while Gemini processes
  function getThinkingLabel(_fieldType: string, _transcript: string) {
    return 'Extracting your answer...'
  }

  // --- CORE CONVERSE HANDLER ---
  const handleConverseResponse = useCallback(async (
    userMessage: string,
    fieldIndex: number,
    mode: 'text' | 'voice',
    onSuccess: (aiMessage: string, isComplete: boolean) => void,
    extraContext?: string,
    confidence?: number,
    tappedOption?: string,
  ) => {
    store.setIsAiTyping(true)
    store.setConnectionLost(false)
    if (mode === 'voice') setVoiceState(prev => prev === 'speaking' ? 'speaking' : 'thinking')

    // Newest input wins: cancel any in-flight turn, claim a fresh turn id.
    if (activeConverseRef.current) {
      activeConverseRef.current.userAborted = true
      activeConverseRef.current.controller.abort()
    }
    const turnId = ++turnCounterRef.current
    const turn: ConverseTurn = { controller: new AbortController(), userAborted: false }
    activeConverseRef.current = turn

    const result = await fetchConverse(
      {
        formId: form.id,
        currentFieldIndex: fieldIndex,
        history: store.history,
        userMessage,
        userEmail,
        currentLanguage: languageRef.current,
        // Answers so far let the server walk the branch tree deterministically
        answers: useConversationStore.getState().answers,
        ...(tappedOption ? { tappedOption } : {}),
        ...(extraContext ? { extraContext } : {}),
        confidence,
      },
      turn,
      // Slow hint: soften the wait without aborting or re-requesting.
      () => {
        const ghost = GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)]
        useConversationStore.getState().replaceMessage('__ai_thinking__', { id: '__ai_thinking__', role: 'ai', text: ghost })
      },
    )

    // Superseded by a newer turn (user corrected / typed something new) — drop silently.
    if (result.aborted || turnId !== turnCounterRef.current) return
    if (activeConverseRef.current === turn) activeConverseRef.current = null

    if (result.timedOut || result.error || !result.data) {
      const ui = mapErrorToUi(result.timedOut ? 'timeout' : result.code)
      store.setIsAiTyping(false)
      isHandlingTranscriptRef.current = false
      isSpeakingRef.current = false

      if (ui.fatal) {
        // Unrecoverable (no keys / closed / deleted) — block the session with
        // a clear explanation instead of an endless retry loop.
        killAudio()
        store.setFatalError(result.code ?? 'not_found')
        return
      }

      if (result.code === 'rate_limited') {
        toast.error(ui.title, { description: ui.description, duration: 5000 })
      } else {
        store.setConnectionLost(true)
      }
      if (mode === 'voice') {
        setVoiceState('error')
        setShowTextHint(true)
      }
      return
    }

    const data = result.data
    store.setConnectionLost(false)

    // Language switch (symmetric): when the AI signals a switch, lock it in
    // and swap fillers so we never play wrong-language audio before a reply.
    if ((data.language === 'en' || data.language === 'hi') && data.language !== languageRef.current) {
      languageRef.current = data.language
      switchFillers(data.language)
    }

    if (data.extractedValues && typeof data.extractedValues === 'object') {
      Object.entries(data.extractedValues).forEach(([fieldId, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          store.setAnswer(fieldId, value as string)
          // Show the confirmed pill between questions
          const matchedField = fields.find(f => f.id === fieldId)
          if (matchedField) showConfirmedPill(matchedField.label, value as string)
        }
      })
    } else if (data.extractedValue) {
      store.setAnswer(fields[fieldIndex].id, data.extractedValue)
      showConfirmedPill(fields[fieldIndex].label, data.extractedValue)
    }
    
    if (data.sentiment) {
      store.setSentiment(fields[fieldIndex].id, data.sentiment)
    }
    
    if (data.nextFieldIndex !== undefined) store.setNextField(data.nextFieldIndex)

    if (data.aiMessage) {
      const existingPlaceholder = store.history.some(m => m.id === '__ai_thinking__')
      const newMsg = {
        id: Date.now().toString(),
        role: 'ai' as const,
        text: data.aiMessage,
      }
      if (existingPlaceholder) {
        store.replaceMessage('__ai_thinking__', newMsg)
      } else {
        store.addMessage(newMsg)
      }
    }

    store.setIsAiTyping(false)

    const actuallyComplete = data.isComplete ||
      (data.nextFieldIndex !== undefined && data.nextFieldIndex >= fields.length)

    if (data.aiMessage || data.aiSpokenMessage) {
      onSuccess(data.aiSpokenMessage || data.aiMessage, actuallyComplete)
    } else {
      isSpeakingRef.current = false
    }
  }, [form.id, store, fields, userEmail, killAudio])

  // --- VOICE TRANSCRIPT HANDLER ---
  const { startRecording, stopRecording, isRecording, isProcessing, error: recorderError, stream, vadVolume } = useVoiceRecorder(
    async (transcript, audioBlob, confidence) => {
      // Guard 1: AI is still speaking — ignore, VAD fired too early
      if (isSpeakingRef.current) return
      // Guard 2: Already processing a transcript — ignore duplicate VAD fires
      if (isHandlingTranscriptRef.current) return
      isHandlingTranscriptRef.current = true

      const cleanTranscript = transcript.trim()

      // Empty capture — replay last question, re-listen, and hint toward text input.
      if (cleanTranscript.length < 2) {
        const capturedFieldIndex = store.currentFieldIndex
        emptyCaptureStreakRef.current++
        setShowTextHint(true)
        // Too many empties in a row (silence/noise, dead mic, or failing audio):
        // stop the reprompt→re-listen loop so we don't spin requests. Go idle
        // and let the user tap the orb or type to resume.
        if (emptyCaptureStreakRef.current >= MAX_EMPTY_CAPTURES) {
          emptyCaptureStreakRef.current = 0
          setVoiceState('idle')
          isHandlingTranscriptRef.current = false
          return
        }
        const lastAiMessage = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text
        const reprompt = lastAiMessage || "Sorry, didn't quite catch that — could you try again?"
        playSmartAudio(reprompt, () => {
          setVoiceState('idle')
          if (shouldAutoListen(capturedFieldIndex)) startRecording()
          isHandlingTranscriptRef.current = false
        })
        return
      }
      // A real capture resets the empty streak.
      emptyCaptureStreakRef.current = 0

      const fieldIndex = store.currentFieldIndex
      const currentField = fields[fieldIndex]

      if (audioBlob.size > 0) store.setAudioBlob(currentField.id, audioBlob)

      // Optimistic UI: user message + thinking placeholder
      const userMsgId = Date.now().toString()
      store.addMessage({ id: userMsgId, role: 'user', text: `[Voice] ${cleanTranscript}` })
      store.addMessage({
        id: '__ai_thinking__',
        role: 'ai',
        text: getThinkingLabel(currentField?.field_type || 'text', cleanTranscript),
      })

      // CORRECTION WINDOW: show "You said: X" with a drain timer WHILE the AI
      // processes in parallel — zero added latency, tap to abort and fix.
      setPendingTranscript({ text: cleanTranscript, fieldIndex, userMsgId })
      const pillConfirmed = new Promise<boolean>(res => { pillResolveRef.current = res })

      // LATENCY MASKING: Instantly play a random filler right when processing starts
      if (fillerAudioRef.current.length > 0 && audioRef.current) {
        const base64 = fillerAudioRef.current[Math.floor(Math.random() * fillerAudioRef.current.length)]
        audioRef.current.onended = null // CRITICAL: Clear old playback handlers!
        isSpeakingRef.current = true    // CRITICAL: Lock VAD while filler plays
        audioRef.current.playbackRate = 1 // never inherit a stale rate
        audioRef.current.src = `data:audio/${fillerFormatRef.current};base64,${base64}`
        audioRef.current.play().catch(() => { })
        setVoiceState('speaking') // turns the orb instantly yellow/active
      } else {
        setVoiceState('thinking')
      }

      // Fire converse immediately (parallel with the correction window); the
      // AI's reply is only played once the pill confirms (drain or explicit).
      await handleConverseResponse(cleanTranscript, fieldIndex, 'voice', (aiMessage, isComplete) => {
        pillConfirmed.then(ok => {
          if (!ok) return // user is correcting — this turn's reply is void
          setPendingTranscript(null)
          playSmartAudio(aiMessage, () => {
            isHandlingTranscriptRef.current = false
            setVoiceState('idle')
            if (!isComplete) {
              if (shouldAutoListen(useConversationStore.getState().currentFieldIndex)) startRecording()
            } else {
              store.setMode('review')
            }
          })
        })
      }, undefined, confidence)

      // P0 fix: use voiceStateRef (not voiceState) to read the CURRENT state value,
      // not the stale closure value captured when this callback was created.
      if (isHandlingTranscriptRef.current && voiceStateRef.current === 'error') {
        isHandlingTranscriptRef.current = false
        setPendingTranscript(null) // error orb replaces the correction window
      }
    },
    form.id,
  )

  useEffect(() => {
    if (isRecording) setVoiceState('listening')
    if (isProcessing) setVoiceState('transcribing')
    if (recorderError) setVoiceState('error')
  }, [isRecording, isProcessing, recorderError])

  // Debounce for tap inputs (MCQ chips): blocks accidental double-fires while
  // still allowing a deliberate re-tap (e.g. changing your answer) after 500ms.
  const lastTapRef = useRef(0)

  // BARGE-IN: the user takes over while the AI is speaking or thinking.
  // Silences everything, aborts any in-flight turn, resets the busy flags —
  // the caller then starts a fresh turn immediately. This is what makes chips,
  // uploads and typing feel alive instead of "wait for the voice to finish".
  const bargeIn = useCallback(() => {
    killAudio()
    stopRecording(true)
    if (activeConverseRef.current) {
      activeConverseRef.current.userAborted = true
      activeConverseRef.current.controller.abort()
      activeConverseRef.current = null
    }
    turnCounterRef.current++            // stale resolutions get discarded
    pillResolveRef.current?.(false)     // void any pending correction pill
    pillResolveRef.current = null
    setPendingTranscript(null)
    isHandlingTranscriptRef.current = false
    store.setIsAiTyping(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killAudio, stopRecording])

  // Input mode per field: tap fields (mcq) and upload fields (file) never open
  // the mic — the AI speaks the question, then the user just taps/uploads.
  function inputModeFor(fieldIndex: number): 'voice' | 'tap' | 'upload' {
    const t = fields[fieldIndex]?.field_type
    return t === 'mcq' ? 'tap' : t === 'file' ? 'upload' : 'voice'
  }
  function shouldAutoListen(fieldIndex: number) {
    return inputModeFor(fieldIndex) === 'voice'
  }

  async function handleInitialSequence() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach(t => t.stop())
    } catch (e: any) {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
      if (e?.name === 'NotAllowedError') {
        if (isIOS) {
          toast.error("Microphone blocked", {
            description: "Go to Settings → Safari → Microphone to enable access, then reload.",
            duration: 8000,
            action: { label: 'Reload', onClick: () => window.location.reload() },
          })
        } else {
          toast.error("Microphone blocked", {
            description: "Click the lock icon in your browser's address bar to allow microphone access.",
            duration: 6000,
          })
        }
      } else {
        toast.error("Microphone unavailable.", {
          description: "No worries — type your answers below.",
          duration: 4000,
        })
      }
      setShowTextHint(true)
      // Continue in voice mode — TTS still plays, user types their answers
    }
    setVoiceState('thinking')

    const prefillEntries = Object.entries(prefills)
    const prefillNote = prefillEntries.length > 0
      ? `Note: You already know the following about this user from the URL: ${prefillEntries.map(([k, v]) => `${k}=${v}`).join(', ')}. Acknowledge this naturally and ask for the first MISSING field.`
      : ''

    store.addMessage({ id: '__ai_thinking__', role: 'ai', text: 'Setting things up...' })

    // Start a session for drop-off / timing / device analytics (best-effort).
    // Preview runs are excluded from analytics entirely.
    if (!isPreview) {
      try {
        startFormSession(form.id, parseDevice(navigator.userAgent), fields.length)
          .then(res => { if (res && 'sessionId' in res && res.sessionId) sessionIdRef.current = res.sessionId })
          .catch(() => {})
      } catch { }
      // Top-of-funnel event so PostHog matches the in-app session funnel.
      try {
        if (typeof window !== 'undefined' && (window as any).posthog) {
          (window as any).posthog.capture('form_started', { form_id: form.id, total_fields: fields.length })
        }
      } catch { }
    }

    // Resume at the branch-aware frontier — first unanswered field ON THE PATH
    // (a plain first-unanswered scan would land on skipped branch questions).
    const frontier = computePath(fields as BranchField[], store.answers).frontier
    const startFieldIndex = Math.min(frontier, fields.length - 1)

    await handleConverseResponse('Hello', startFieldIndex, 'voice', (aiMessage) => {
      playSmartAudio(aiMessage, () => {
        setVoiceState('idle')
        if (shouldAutoListen(useConversationStore.getState().currentFieldIndex)) startRecording()
      })
    }, prefillNote)
  }

  // --- INLINE TEXT HANDLER (unified — feeds same TTS+mic loop as voice) ---
  async function handleSendVoiceText(e: React.FormEvent) {
    e.preventDefault()
    const userMsg = inputText.trim()
    if (!userMsg) return
    setInputText('')
    // Typing is a barge-in: newest input wins, even mid-speech or mid-turn.
    bargeIn()
    isHandlingTranscriptRef.current = true
    store.addMessage({ id: Date.now().toString(), role: 'user', text: userMsg })
    store.addMessage({ id: '__ai_thinking__', role: 'ai', text: getThinkingLabel(fields[store.currentFieldIndex]?.field_type || 'text', userMsg) })
    setVoiceState('thinking')
    await handleConverseResponse(userMsg, store.currentFieldIndex, 'voice', (aiMessage, isComplete) => {
      playSmartAudio(aiMessage, () => {
        isHandlingTranscriptRef.current = false
        setVoiceState('idle')
        if (!isComplete) {
          if (shouldAutoListen(useConversationStore.getState().currentFieldIndex)) startRecording()
        } else {
          store.setMode('review')
        }
      })
    })
  }

  async function handleSubmitForm() {
    // Preview: never write anything — no response, no session, no email.
    if (isPreview) {
      setSubmissionId(`preview-${Date.now()}`)
      setSubmissionTime(new Date().toLocaleString())
      playChime()
      store.setMode('success')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const inputMethod = store.history.some(h => h.role === 'user' && h.text.includes('[Voice]'))
        ? 'voice' : 'text'

      // Branched forms: only answers on the taken path are submitted — answers
      // orphaned by a corrected branch choice stay behind (server re-filters too).
      const onPath = onPathFieldIds(fields as BranchField[], store.answers)
      const pathAnswers = Object.fromEntries(Object.entries(store.answers).filter(([id]) => onPath.has(id)))
      const pathSentiments = Object.fromEntries(Object.entries(store.sentiments).filter(([id]) => onPath.has(id)))

      const formData = new FormData()
      formData.append('formId', form.id)
      formData.append('inputMethod', inputMethod)
      formData.append('sessionId', sessionIdRef.current ?? '')
      formData.append('answers', JSON.stringify(pathAnswers))
      formData.append('sentiments', JSON.stringify(pathSentiments))
      formData.append('history', JSON.stringify(store.history))

      Object.entries(store.audioBlobs).forEach(([fieldId, audioBlob]) => {
        if (!onPath.has(fieldId)) return
        formData.append(`audio_${fieldId}`, audioBlob as Blob, `${fieldId}.webm`)
      })

      const result = await submitResponse(formData)
      try { localStorage.removeItem(ANSWERS_KEY) } catch { }
      if (result.responseId) setSubmissionId(result.responseId)
      setSubmissionTime(new Date().toLocaleString())
      playChime()
      store.setMode('success')
    } catch (e: any) {
      console.error(e)
      setSubmitError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // --- THINKING DOTS ANIMATION ---
  // Replaces the filler words. Shows while voiceState is 'thinking' or 'transcribing'.
  // Three dots that animate sequentially — universally understood as "processing".
  const ThinkingDots = () => (
    <div className="flex items-center gap-1.5 h-8">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-foreground/30"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{
            repeat: Infinity,
            duration: 1.2,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )

  // ConnectionLostToast replaced by sonner useEffect above — no inline component needed

  // ==================== RENDERS ====================

  // Owner-only preview: fixed strip so it's visible in every mode.
  const previewBanner = isPreview ? (
    <div className="fixed top-0 inset-x-0 z-[60] bg-accent-amber text-black text-center text-xs font-semibold py-1.5">
      Preview mode. Responses won&apos;t be saved.
    </div>
  ) : null

  // Unrecoverable error — a clear, honest dead-end beats an infinite retry loop.
  if (store.fatalError) {
    const ui = mapErrorToUi(store.fatalError)
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight mb-4">{ui.title}</h1>
          <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/10 text-foreground/60 mb-6 font-medium">
            {ui.description}
          </div>
          <p className="text-xs text-foreground/30 font-medium tracking-wide uppercase">Powered by Voca</p>
        </div>
      </main>
    )
  }

  if (store.mode === 'voice' || store.mode === 'choice') {
    const lastAiText = store.history.filter(m => m.role === 'ai').slice(-1)[0]?.text ?? ''
    const isThinking = voiceState === 'thinking' || voiceState === 'transcribing'
    // Path-aware progress: on branched forms the position/total follow the
    // taken path (identical to index math on linear forms).
    const path = computePath(fields as BranchField[], store.answers)
    const totalFields = projectedTotal(fields as BranchField[], store.answers)
    const posInPath = path.visited.indexOf(store.currentFieldIndex)
    const currentQuestionNum = Math.min(posInPath >= 0 ? posInPath + 1 : path.visited.length, totalFields)

    const orbColour = !started
      ? 'bg-accent-amber/15 border border-accent-amber/30 shadow-[0_0_60px_rgba(234,140,20,0.2)]'
      : voiceState === 'speaking'
        ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_80px_rgba(251,191,36,0.35)]'
        : voiceState === 'listening'
          ? 'bg-gradient-to-br from-lime-400 to-emerald-500 shadow-[0_0_80px_rgba(163,230,53,0.35)]'
          : voiceState === 'error'
            ? 'bg-red-500/80'
            : 'bg-foreground/10 border border-foreground/10'

    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-between p-6 pt-safe pb-safe bg-background overflow-hidden" role="main" aria-label={`Voice form: ${form.title}`}>
        {previewBanner}
        {/* Captions mode: audio pipeline failed repeatedly — read-along instead */}
        {captionsMode && (
          <div className="w-full max-w-sm rounded-xl bg-accent-amber/[0.08] border border-accent-amber/20 px-4 py-2 text-xs text-accent-amber text-center">
            Audio unavailable, reading mode is on. Your mic still works.
          </div>
        )}
        {/* Progress indicator (only once the conversation has begun) */}
        {started ? (
          <div className="w-full max-w-sm pt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-foreground/40 font-medium">Question {currentQuestionNum} of {totalFields}</span>
              <span className="text-xs text-foreground/30">{Math.round((currentQuestionNum / totalFields) * 100)}%</span>
            </div>
            <div className="h-1 w-full bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-amber rounded-full transition-all duration-700"
                style={{ width: `${(currentQuestionNum / totalFields) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm pt-4" />
        )}

        {/* Ambient background glow — brighter, two-tone */}
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] -z-10 transition-all duration-1000 pointer-events-none ${
          voiceState === 'speaking' ? 'bg-amber-400/12'
          : voiceState === 'listening' ? 'bg-lime-400/12'
          : 'opacity-0'
        }`} />

        <div />

        <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} className="flex flex-col items-center gap-10 w-full max-w-sm mx-auto">

          {/* Pre-start: the form's welcome header (replaces the old choice screen) */}
          {!started && (
            <div className="text-center">
              <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight mb-3">{form.title}</h1>
              {form.description && (
                <p className="text-base text-foreground/55 max-w-xs mx-auto">{form.description}</p>
              )}
              <p className="mt-4 text-sm text-foreground/40 flex items-center justify-center gap-2">
                <span>{fields.length} question{fields.length !== 1 ? 's' : ''}</span>
                <span className="h-1 w-1 rounded-full bg-foreground/20" />
                <span>about {Math.max(1, Math.round((fields.length * 12) / 60))} min</span>
                <span className="h-1 w-1 rounded-full bg-foreground/20" />
                <span>just talk</span>
              </p>
            </div>
          )}

          {/* Current question text OR thinking dots */}
          <div className={`${started ? 'min-h-[80px]' : 'hidden'} flex items-center justify-center w-full`}>
            <AnimatePresence mode="wait">
              {isThinking ? (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ThinkingDots />
                </motion.div>
              ) : lastAiText ? (
                <motion.p
                  key={lastAiText}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="font-serif text-2xl sm:text-3xl text-center leading-snug text-foreground px-2"
                >
                  {lastAiText.replace('[Voice]', '')}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Orb */}
          <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
            {/* Outer pulse ring — only when listening */}
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-lime-400/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              />
            )}
            {/* Second inner ring — listening */}
            {voiceState === 'listening' && (
              <motion.div
                className="absolute inset-4 rounded-full bg-lime-400/10"
                animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: 'easeInOut' }}
              />
            )}
            {/* Speaking pulse ring */}
            {voiceState === 'speaking' && (
              <motion.div
                className="absolute inset-0 rounded-full bg-amber-400/20"
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              />
            )}

            <motion.button
              aria-label={voiceState === 'listening' ? 'Stop recording' : voiceState === 'speaking' ? 'Skip the AI voice' : voiceState === 'error' ? 'Tap to retry recording' : 'Voice input orb'}
              onClick={() => {
                if (!startedRef.current) {
                  // First tap = the audio-unlock gesture + conversation start.
                  if (!audioRef.current) audioRef.current = new Audio()
                  audioRef.current.src = SILENT_WAV
                  audioRef.current.play().catch(() => { })
                  audioRef.current.src = ''
                  beginSession()
                  return
                }
                if (voiceState === 'listening') stopRecording()
                if (voiceState === 'speaking') {
                  // Tap to skip the AI's speech.
                  killAudio()
                  if (activeConverseRef.current) {
                    // Reply still coming (this was the filler) — keep thinking.
                    setVoiceState('thinking')
                  } else {
                    isHandlingTranscriptRef.current = false
                    setVoiceState('idle')
                    const idx = useConversationStore.getState().currentFieldIndex
                    if (idx >= fields.length) {
                      // Skipped the final goodbye — go straight to review.
                      store.setMode('review')
                    } else if (shouldAutoListen(idx)) {
                      startRecording()
                    }
                  }
                }
                if (voiceState === 'error') {
                  isHandlingTranscriptRef.current = false
                  setVoiceState('idle')
                  if (shouldAutoListen(useConversationStore.getState().currentFieldIndex)) startRecording()
                }
              }}
              className={`relative z-10 w-[160px] h-[160px] rounded-full flex flex-col items-center justify-center transition-all duration-500 ${orbColour}`}
              animate={isThinking
                ? { scale: [0.96, 1, 0.96], opacity: [0.5, 1, 0.5] }
                : { scale: 1, opacity: 1 }
              }
              transition={{ repeat: isThinking ? Infinity : 0, duration: 1.4 }}
            >
              {/* Pre-start invite */}
              {!started && (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                >
                  <Mic className="h-9 w-9 text-accent-amber" />
                </motion.div>
              )}
              {/* Real frequency waveform from mic stream */}
              {voiceState === 'listening' && (
                <Waveform stream={stream} isActive={true} color="rgba(0,0,0,0.65)" />
              )}
              {voiceState === 'listening' && (
                <Square className="h-4 w-4 text-black/60 fill-black/60 mt-1" />
              )}
              {voiceState === 'error' && (
                <div className="flex flex-col items-center gap-1">
                  <WifiOff className="h-7 w-7 text-white" />
                  <span className="text-white text-xs font-medium">Tap retry</span>
                </div>
              )}
            </motion.button>
          </div>

          {/* Pre-start: tap invite + language choice */}
          {!started && (
            <div className="flex flex-col items-center gap-6 -mt-2">
              <p className="text-sm font-medium text-foreground/60">
                {needsTap ? 'Tap to begin' : 'Starting…'}
              </p>
              <div className="flex items-center gap-2">
                {(['hi', 'en'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => { setSelectedLang(lang); languageRef.current = lang; switchFillers(lang) }}
                    className={`px-4 py-1.5 rounded-full text-sm font-sans transition-all ${
                      selectedLang === lang
                        ? 'bg-foreground text-background shadow-sm'
                        : 'bg-foreground/[0.05] text-foreground/50 hover:bg-foreground/[0.08] border border-foreground/10'
                    }`}
                  >
                    {lang === 'hi' ? 'हिंदी' : 'English'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Listening indicator — the mic stays open until the orb is tapped */}
          <AnimatePresence>
            {showDoneHint && voiceState === 'listening' && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-sm font-medium text-lime-400 -mt-4"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
                </span>
                Listening… tap the orb when you&apos;re done
              </motion.p>
            )}
          </AnimatePresence>

          {/* Correction window: what we heard, tap to fix while the AI thinks */}
          <AnimatePresence>
            {pendingTranscript && (
              <div className="w-full max-w-xs">
                <ConfirmationPill
                  key={pendingTranscript.userMsgId}
                  fieldLabel="You said"
                  value={pendingTranscript.text}
                  fieldType="text"
                  durationMs={2500}
                  onAutoConfirm={() => {
                    pillResolveRef.current?.(true)
                    pillResolveRef.current = null
                  }}
                  onEditStart={() => {
                    // Abort the in-flight turn and silence everything — the
                    // user is taking over to correct what we heard.
                    if (activeConverseRef.current) {
                      activeConverseRef.current.userAborted = true
                      activeConverseRef.current.controller.abort()
                    }
                    killAudio()
                    pillResolveRef.current?.(false)
                    pillResolveRef.current = null
                    isHandlingTranscriptRef.current = false
                    store.setIsAiTyping(false)
                    setVoiceState('idle')
                  }}
                  onEdit={(newValue) => {
                    const corrected = newValue.trim()
                    const { fieldIndex, userMsgId } = pendingTranscript
                    setPendingTranscript(null)
                    if (!corrected) return
                    // Swap the optimistic voice message for the corrected text
                    // and resend as a fresh turn (text — no re-transcription).
                    store.replaceMessage(userMsgId, { id: userMsgId, role: 'user', text: `[Voice] ${corrected}` })
                    isHandlingTranscriptRef.current = true
                    setVoiceState('thinking')
                    handleConverseResponse(corrected, fieldIndex, 'voice', (aiMessage, isComplete) => {
                      playSmartAudio(aiMessage, () => {
                        isHandlingTranscriptRef.current = false
                        setVoiceState('idle')
                        if (!isComplete) {
                          if (shouldAutoListen(useConversationStore.getState().currentFieldIndex)) startRecording()
                        } else {
                          store.setMode('review')
                        }
                      })
                    })
                  }}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Confirmed answer pill — shown for 4s after answer is captured */}
          <AnimatePresence>
            {lastConfirmedAnswer && (
              <motion.div
                key={lastConfirmedAnswer.value}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/[0.06] border border-foreground/[0.10]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-sage shrink-0" />
                <span className="text-xs text-foreground/50 font-sans">{lastConfirmedAnswer.label}:</span>
                <span className="text-xs text-foreground font-mono font-medium">{lastConfirmedAnswer.value}</span>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>

        {fields[store.currentFieldIndex]?.field_type === 'mcq' && fields[store.currentFieldIndex]?.options?.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex justify-center flex-wrap gap-2 px-4"
          >
            {fields[store.currentFieldIndex].options.map((opt: string) => (
              <button
                key={opt}
                onClick={async () => {
                  // Debounce accidental double-taps; deliberate re-taps
                  // (changing your answer) work after 500ms and simply
                  // supersede the in-flight turn via bargeIn.
                  if (Date.now() - lastTapRef.current < 500) return
                  lastTapRef.current = Date.now()

                  // Tappable even while the AI is mid-sentence.
                  bargeIn()
                  setVoiceState('thinking')

                  store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Selected: ${opt}]` })

                  await handleConverseResponse(`[User tapped: ${opt}]`, store.currentFieldIndex, 'voice', (aiMessage, isComplete) => {
                    playSmartAudio(aiMessage, () => {
                      isHandlingTranscriptRef.current = false
                      setVoiceState('idle')
                      const nextIdx = useConversationStore.getState().currentFieldIndex
                      if (!isComplete) {
                        if (shouldAutoListen(nextIdx)) startRecording()
                      } else {
                        store.setMode('review')
                      }
                    })
                  }, undefined, undefined, opt)
                }}
                className="px-6 py-3 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] active:scale-95 border border-foreground/10 text-foreground font-medium transition-all text-sm"
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}

        {fields[store.currentFieldIndex]?.field_type === 'file' && (
          <div className="w-full max-w-xs mx-auto mt-2 mb-4 px-4 relative z-20">
            <label className={`w-full flex flex-col justify-center items-center gap-2 px-4 py-6 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
              isUploading
                ? 'opacity-50 pointer-events-none border-foreground/20'
                : 'border-accent-amber/40 hover:bg-accent-amber/5 hover:border-accent-amber/60'
            }`}>
              <span className="text-2xl">{isUploading ? '⏳' : '📎'}</span>
              <span className="text-foreground/60 font-medium text-sm text-center">
                {isUploading ? 'Uploading...' : 'Tap to upload file'}
              </span>
              <span className="text-foreground/30 text-xs">Max 5 MB</span>
              <input
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return

                  // 5 MB guard
                  if (file.size > 5 * 1024 * 1024) {
                    store.addMessage({ id: Date.now().toString(), role: 'ai', text: 'File is too large. Please upload something under 5 MB.' })
                    e.target.value = ''
                    return
                  }

                  // Uploadable even while the AI is mid-sentence.
                  bargeIn()
                  setIsUploading(true)
                  setVoiceState('thinking')

                  const supabase = createClient()
                  const ext = file.name.split('.').pop() || 'bin'
                  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)
                  const fileName = `${Date.now()}-${safeBase}`

                  const { error } = await supabase.storage
                    .from('user_files')
                    .upload(fileName, file, { contentType: file.type, upsert: false })

                  setIsUploading(false)

                  if (error) {
                    isHandlingTranscriptRef.current = false
                    store.addMessage({ id: Date.now().toString(), role: 'ai', text: `Upload failed: ${error.message}` })
                    setVoiceState('idle')
                    // Don't restart mic for file fields — user needs to upload
                    return
                  }

                  const { data: publicData } = supabase.storage.from('user_files').getPublicUrl(fileName)
                  const publicUrl = publicData.publicUrl

                  store.addMessage({ id: Date.now().toString(), role: 'user', text: `[Uploaded: ${file.name}]` })
                  // Store the raw URL directly so review screen can show it
                  store.setAnswer(fields[store.currentFieldIndex].id, publicUrl)

                  const nextIdx = store.currentFieldIndex
                  isHandlingTranscriptRef.current = true
                  try {
                    await handleConverseResponse(
                      `[System: User uploaded file. Name: ${file.name}, URL: ${publicUrl}]`,
                      nextIdx,
                      'voice',
                      (aiMessage, isComplete) => {
                        playSmartAudio(aiMessage, () => {
                          isHandlingTranscriptRef.current = false
                          setVoiceState('idle')
                          const newIdx = useConversationStore.getState().currentFieldIndex
                          if (!isComplete) {
                            // Only start mic if next field is NOT a file field
                            if (shouldAutoListen(newIdx)) startRecording()
                          } else {
                            store.setMode('review')
                          }
                        })
                      }
                    )
                  } catch {
                    isHandlingTranscriptRef.current = false
                    setVoiceState('idle')
                  }
                }}
              />
            </label>
          </div>
        )}

        <form onSubmit={handleSendVoiceText} className="w-full max-w-xs mx-auto pb-4 pt-6 z-20">
          <div className={`flex items-center gap-1 rounded-full px-5 transition-all duration-300 border ${
            showTextHint
              ? 'border-accent-amber/50 bg-accent-amber/5 ring-2 ring-accent-amber/20'
              : 'border-foreground/10 bg-foreground/[0.04]'
          }`}>
            <input
              ref={textInputRef}
              type="text"
              aria-label="Type your answer"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={showTextHint ? "Couldn't catch that — type instead" : "Or type here..."}
              className="flex-1 bg-transparent py-4 focus:outline-none text-foreground text-sm font-sans text-center placeholder:text-foreground/40 transition-colors"
            />
            <AnimatePresence>
              {inputText.trim() && (
                <motion.button
                  type="submit"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="shrink-0 p-1.5 rounded-full text-foreground/50 hover:text-foreground/80 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </form>
      </main>
    )
  }

  if (store.mode === 'review') {
    // Only the questions on the taken path get reviewed — off-path fields are
    // never enforced as required and their orphaned answers stay hidden.
    const reviewPath = onPathFieldIds(fields as BranchField[], store.answers)
    return (
      <>
        {previewBanner}
        <ReviewScreen
          form={form}
          fields={fields.filter(f => reviewPath.has(f.id))}
          answers={store.answers}
          onAnswerChange={(id, v) => store.setAnswer(id, v)}
          onSubmit={handleSubmitForm}
          submitting={submitting}
          submitError={submitError}
        />
      </>
    )
  }

  if (store.mode === 'success') {
    const successPath = onPathFieldIds(fields as BranchField[], store.answers)
    return (
      <>
        {previewBanner}
        <SuccessScreen
          form={form}
          fields={fields.filter(f => successPath.has(f.id))}
          answers={store.answers}
          submissionId={submissionId}
          submissionTime={submissionTime}
          redirectUrl={isPreview ? null : form.redirect_url}
        />
      </>
    )
  }

  return null
}
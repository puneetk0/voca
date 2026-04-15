'use client'

import { useState } from 'react'
import { saveUserKeys } from '@/lib/actions/keys'
import { validateAPIKeys } from '@/lib/actions/validate-keys'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid'

export default function SettingsForm({ initialGemini, initialGroq, initialGoogleTTS, initialGcpProjectId }: { initialGemini: string; initialGroq: string; initialGoogleTTS?: string; initialGcpProjectId?: string }) {
  const [geminiKey, setGeminiKey] = useState(initialGemini)
  const [groqKey, setGroqKey] = useState(initialGroq)
  const [googleTTSKey, setGoogleTTSKey] = useState(initialGoogleTTS || '')
  const [gcpProjectId, setGcpProjectId] = useState(initialGcpProjectId || '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>('idle')
  const [groqStatus, setGroqStatus] = useState<KeyStatus>('idle')
  const [googleTTSStatus, setGoogleTTSStatus] = useState<KeyStatus>('idle')
  const [geminiError, setGeminiError] = useState('')
  const [groqError, setGroqError] = useState('')
  const [googleTTSError, setGoogleTTSError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setGeminiStatus('checking')
    setGroqStatus('checking')
    if (googleTTSKey) setGoogleTTSStatus('checking')
    else setGoogleTTSStatus('idle')

    setGeminiError('')
    setGroqError('')
    setGoogleTTSError('')
    setErrorMessage('')

    // Step 1: Pre-flight validation
    const validation = await validateAPIKeys(geminiKey, groqKey, googleTTSKey)

    setGeminiStatus(validation.gemini ? 'valid' : 'invalid')
    setGroqStatus(validation.groq ? 'valid' : 'invalid')
    if (googleTTSKey) {
      setGoogleTTSStatus(validation.googleTTS ? 'valid' : 'invalid')
    }

    if (validation.geminiError) setGeminiError(validation.geminiError)
    if (validation.groqError) setGroqError(validation.groqError)
    if (validation.googleTTSError) setGoogleTTSError(validation.googleTTSError)

    // Pair validation: both TTS key and Project ID must be set together, or neither
    const hasGCPKey = !!googleTTSKey
    const hasGCPProject = !!gcpProjectId
    if (hasGCPKey !== hasGCPProject) {
      setStatus('error')
      setErrorMessage('Google Cloud API Key and Project ID must both be set together.')
      return
    }

    if (!validation.gemini || !validation.groq || (googleTTSKey && !validation.googleTTS)) {
      setStatus('error')
      setErrorMessage('One or more keys failed validation. Please fix them before saving.')
      return
    }

    // Step 2: Save to DB
    const result = await saveUserKeys(geminiKey, groqKey, googleTTSKey, gcpProjectId)
    if (result?.error) {
      setStatus('error')
      setErrorMessage(result.error)
    } else {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  const KeyIndicator = ({ status, error }: { status: KeyStatus; error: string }) => {
    if (status === 'idle') return null
    if (status === 'checking') return <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
    if (status === 'valid') return <CheckCircle2 className="h-4 w-4 text-accent-sage" />
    return (
      <div className="flex items-center gap-1.5">
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 p-6 rounded-2xl">
        {/* Gemini Key */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="gemini_key" className="block text-sm font-medium">Google Gemini API Key</label>
            <KeyIndicator status={geminiStatus} error={geminiError} />
          </div>
          <input
            id="gemini_key"
            type="password"
            required
            value={geminiKey}
            onChange={(e) => { setGeminiKey(e.target.value); setGeminiStatus('idle') }}
            placeholder="AIzaSy..."
            className="mt-1 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
          />
        </div>

        {/* Groq Key */}
        <div className="pt-4 border-t border-foreground/10">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="groq_key" className="block text-sm font-medium">Groq API Key</label>
            <KeyIndicator status={groqStatus} error={groqError} />
          </div>
          <input
            id="groq_key"
            type="password"
            required
            value={groqKey}
            onChange={(e) => { setGroqKey(e.target.value); setGroqStatus('idle') }}
            placeholder="gsk_..."
            className="mt-1 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
          />
        </div>
        {/* Google Cloud Section */}
        <div className="pt-4 border-t border-foreground/10 space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-foreground/40">Google Cloud (Optional — Premium Voice &amp; Transcription)</p>

          {/* Google TTS / STT API Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="google_tts_key" className="block text-sm font-medium">GCP API Key</label>
              <KeyIndicator status={googleTTSStatus} error={googleTTSError} />
            </div>
            <input
              id="google_tts_key"
              type="password"
              value={googleTTSKey}
              onChange={(e) => { setGoogleTTSKey(e.target.value); setGoogleTTSStatus('idle') }}
              placeholder="AIzaSy..."
              className="mt-1 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
            />
          </div>

          {/* GCP Project ID */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="gcp_project_id" className="block text-sm font-medium">GCP Project ID</label>
            </div>
            <input
              id="gcp_project_id"
              type="text"
              value={gcpProjectId}
              onChange={(e) => setGcpProjectId(e.target.value)}
              placeholder="voca-forms-123456"
              className="mt-1 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm font-mono text-sm"
            />
            <p className="mt-1.5 text-xs text-foreground/40">Found in the GCP Console top-left dropdown. Required alongside the API key.</p>
          </div>
        </div>
      </div>

      {status === 'error' && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{errorMessage}</div>
      )}
      {status === 'success' && (
        <div className="p-3 rounded-lg bg-accent-sage/10 text-accent-sage text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Keys validated and updated securely.
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="flex items-center gap-2 justify-center rounded-full bg-accent-amber px-8 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === 'loading' ? 'Validating & Saving...' : 'Update Keys'}
      </button>
    </form>
  )
}

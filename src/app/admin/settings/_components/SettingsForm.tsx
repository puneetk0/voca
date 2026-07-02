'use client'

import { useState } from 'react'
import { saveUserKeys } from '@/lib/actions/keys'
import { validateAPIKeys } from '@/lib/actions/validate-keys'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid'

export default function SettingsForm({ initialGroq, hasPlatformKeys }: { initialGroq: string; hasPlatformKeys?: boolean }) {
  const [groqKey, setGroqKey] = useState(initialGroq)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [groqStatus, setGroqStatus] = useState<KeyStatus>('idle')
  const [groqError, setGroqError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setGroqError('')
    setErrorMessage('')

    // Only validate a non-empty key (empty = fall back to platform keys)
    if (groqKey) {
      setGroqStatus('checking')
      const validation = await validateAPIKeys(groqKey)
      setGroqStatus(validation.groq ? 'valid' : 'invalid')
      if (validation.groqError) setGroqError(validation.groqError)
      if (!validation.groq) {
        setStatus('error')
        setErrorMessage('Your Groq key failed validation. Fix it before saving.')
        return
      }
    } else {
      setGroqStatus('idle')
    }

    const result = await saveUserKeys(groqKey)
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
      {hasPlatformKeys && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-accent-sage/10 border border-accent-sage/20 text-sm">
          <CheckCircle2 className="h-4 w-4 text-accent-sage mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-accent-sage">Platform keys are active</p>
            <p className="text-foreground/60 mt-0.5">Your forms work out of the box. Add your own Groq key below to use your personal quota.</p>
          </div>
        </div>
      )}
      <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 p-6 rounded-2xl">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="groq_key" className="block text-sm font-medium">Groq API Key</label>
            <KeyIndicator status={groqStatus} error={groqError} />
          </div>
          <input
            id="groq_key"
            type="password"
            value={groqKey}
            onChange={(e) => { setGroqKey(e.target.value); setGroqStatus('idle') }}
            placeholder="gsk_..."
            className="mt-1 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
          />
          <p className="mt-2 text-xs text-foreground/45">
            Powers conversation and transcription. Get one free at console.groq.com. Voice output uses the platform&apos;s Sarvam voice.
          </p>
        </div>
      </div>

      {status === 'error' && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{errorMessage}</div>
      )}
      {status === 'success' && (
        <div className="p-3 rounded-lg bg-accent-sage/10 text-accent-sage text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Key validated and saved securely.
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="flex items-center gap-2 justify-center rounded-full bg-accent-amber px-8 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
        {status === 'loading' ? 'Validating & Saving...' : 'Update Key'}
      </button>
    </form>
  )
}

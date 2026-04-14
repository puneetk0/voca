'use client'

import { useState } from 'react'
import { saveUserKeys } from '@/lib/actions/keys'
import { CheckCircle2 } from 'lucide-react'

export default function SettingsForm({ initialGemini, initialGroq }: { initialGemini: string, initialGroq: string }) {
  const [geminiKey, setGeminiKey] = useState(initialGemini)
  const [groqKey, setGroqKey] = useState(initialGroq)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    const result = await saveUserKeys(geminiKey, groqKey)

    if (result?.error) {
      setStatus('error')
      setErrorMessage(result.error)
    } else {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-xl">
      <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 p-6 rounded-2xl">
        <div>
          <label htmlFor="gemini_key" className="block text-sm font-medium">Google Gemini API Key</label>
          <input
            id="gemini_key"
            type="password"
            required
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="mt-2 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
          />
        </div>

        <div className="pt-4 border-t border-foreground/10">
          <label htmlFor="groq_key" className="block text-sm font-medium">Groq API Key</label>
          <input
            id="groq_key"
            type="password"
            required
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder="gsk_..."
            className="mt-2 block w-full rounded-xl border-0 bg-background py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
          />
        </div>
      </div>

      {status === 'error' && (
         <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{errorMessage}</div>
      )}

      {status === 'success' && (
         <div className="p-3 rounded-lg bg-accent-sage/10 text-accent-sage text-sm flex items-center gap-2">
           <CheckCircle2 className="h-4 w-4" /> Keys updated securely
         </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="flex justify-center rounded-full bg-accent-amber px-8 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {status === 'loading' ? 'Saving...' : 'Update Keys'}
      </button>
    </form>
  )
}

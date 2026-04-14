'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Key } from 'lucide-react'
import { saveUserKeys } from '@/lib/actions/keys'

export default function OnboardingPage() {
  const [geminiKey, setGeminiKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    const result = await saveUserKeys(geminiKey, groqKey)

    if (result?.error) {
      setStatus('error')
      setErrorMessage(result.error)
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  return (
    <main className="flex flex-col items-center justify-center py-24 px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-sage/10 mb-6">
            <Key className="h-8 w-8 text-accent-sage" />
          </div>
          <h1 className="text-3xl font-serif font-medium tracking-tight">API Key Setup</h1>
          <p className="mt-3 text-foreground/70">
            Voca is free forever. To make this possible, you bring your own API keys. 
            This takes about 3 minutes and you only do it once.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-10 space-y-6">
          <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 p-6 rounded-2xl">
            {/* Gemini Key */}
            <div>
              <label htmlFor="gemini_key" className="block text-sm font-medium">
                Google Gemini API Key
              </label>
              <p className="text-xs text-foreground/50 mt-1 mb-2">
                Powers the core conversation engine. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-accent-amber hover:underline">Get it here →</a>
              </p>
              <input
                id="gemini_key"
                type="password"
                required
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
              />
            </div>

            {/* Groq Key */}
            <div className="pt-4 border-t border-foreground/10">
              <label htmlFor="groq_key" className="block text-sm font-medium">
                Groq API Key
              </label>
              <p className="text-xs text-foreground/50 mt-1 mb-2">
                Powers the ultra-fast Whisper speech-to-text. <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-accent-amber hover:underline">Get it here →</a>
              </p>
              <input
                id="groq_key"
                type="password"
                required
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk_..."
                className="block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:ring-2 focus:ring-inset focus:ring-accent-sage sm:text-sm"
              />
            </div>
          </div>

          {status === 'error' && (
             <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm text-center">
               {errorMessage}
             </div>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="flex w-full justify-center rounded-full bg-accent-sage px-6 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50 transition-all font-sans"
          >
            {status === 'loading' ? 'Saving securely...' : 'Save Keys & Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}

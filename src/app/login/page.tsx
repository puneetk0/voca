'use client'

import { useState } from 'react'
import { loginWithMagicLink } from '@/lib/actions/auth'
import { Sparkles } from 'lucide-react'

export default function LoginPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function actionName(formData: FormData) {
    setStatus('loading')
    const res = await loginWithMagicLink(formData)
    if (res?.error) {
      setStatus('error')
      setMessage(res.error)
    } else if (res?.success) {
      setStatus('success')
      setMessage(res.message!)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-accent-amber mb-6">
          <Sparkles className="h-12 w-12" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-serif font-medium tracking-tight text-foreground">
          Sign in to Voca
        </h2>
        <p className="mt-2 text-center text-sm text-foreground/60">
          We'll send you a magic link to sign in instantly.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]">
        <div className="bg-foreground/[0.03] border border-foreground/[0.08] py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10">
          <form action={actionName} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium leading-6 text-foreground">
                Email address
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 placeholder:text-foreground/30 focus:ring-2 focus:ring-inset focus:ring-accent-amber sm:text-sm sm:leading-6 transition-all"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={status === 'loading'}
                className="flex w-full justify-center rounded-full bg-accent-amber px-6 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-amber disabled:opacity-50 transition-all font-sans"
              >
                {status === 'loading' ? 'Sending...' : 'Send Magic Link'}
              </button>
            </div>
            
            {status === 'success' && (
              <div className="p-4 rounded-xl bg-accent-sage/10 border border-accent-sage/20 text-accent-sage text-sm text-center">
                {message}
              </div>
            )}
            
            {status === 'error' && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
                {message}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

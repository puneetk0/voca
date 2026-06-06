'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authenticateWithPassword } from '@/lib/actions/auth'
import { Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [agreed, setAgreed] = useState(false)

  async function actionName(formData: FormData) {
    setStatus('loading')
    const res = await authenticateWithPassword(formData)
    if (res?.error) {
      setStatus('error')
      setMessage(res.error)
    } else if (res?.success) {
      setStatus('success')
      router.push('/admin')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-accent-amber mb-6">
          <Sparkles className="h-12 w-12" />
        </div>
        <h2 className="mt-6 text-center text-2xl font-semibold tracking-tight text-foreground">
          {mode === 'login' ? 'Sign in to Voca' : 'Create an Account'}
        </h2>
        <p className="mt-2 text-center text-sm text-foreground/60">
          {mode === 'login' ? 'Enter your email and password to access your dashboard.' : 'Enter an email and password to instantly create your account.'}
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
                <input type="hidden" name="mode" value={mode} />
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
              <label htmlFor="password" className="block text-sm font-medium leading-6 text-foreground">
                Password
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 placeholder:text-foreground/30 focus:ring-2 focus:ring-inset focus:ring-accent-amber sm:text-sm sm:leading-6 transition-all"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-foreground/20 bg-transparent text-accent-amber focus:ring-accent-amber"
                />
                <label htmlFor="terms" className="text-xs text-foreground/50 leading-relaxed cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" className="text-accent-amber hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link href="/privacy" target="_blank" className="text-accent-amber hover:underline">Privacy Policy</Link>.
                  I understand that voice recordings from my forms will be stored securely.
                </label>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={status === 'loading' || (mode === 'signup' && !agreed)}
                className="flex w-full justify-center rounded-full bg-accent-amber px-6 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-amber disabled:opacity-50 transition-all font-sans"
              >
                {status === 'loading' ? 'Authenticating...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </div>

            <div className="text-center mt-2">
              <button 
                type="button" 
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login')
                  setMessage('')
                  setStatus('idle')
                }} 
                className="text-sm font-medium text-accent-amber hover:underline hover:text-accent-amber/80 transition-colors"
              >
                {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
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

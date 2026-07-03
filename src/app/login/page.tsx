'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authenticateWithPassword } from '@/lib/actions/auth'
import { Mic2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSignIn(formData: FormData) {
    setStatus('loading')
    const res = await authenticateWithPassword(formData)
    if (res?.error) {
      setStatus('error')
      setMessage(res.error)
    } else if (res?.success) {
      router.push('/admin')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-accent-amber mb-6">
          <Mic2 className="h-10 w-10" />
        </div>
        <h2 className="mt-6 text-center text-2xl font-semibold tracking-tight text-foreground">
          Sign in to Voca
        </h2>
        <p className="mt-2 text-center text-sm text-foreground/60">
          Welcome back. Enter your details to reach your dashboard.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]">
        <div className="bg-foreground/[0.03] border border-foreground/[0.08] py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10">
          <form action={handleSignIn} className="space-y-6">
            <input type="hidden" name="mode" value="login" />
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
              <label htmlFor="password" className="block text-sm font-medium leading-6 text-foreground">
                Password
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 placeholder:text-foreground/30 focus:ring-2 focus:ring-inset focus:ring-accent-amber sm:text-sm sm:leading-6 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex w-full justify-center rounded-full bg-accent-amber px-6 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-amber disabled:opacity-50 transition-all font-sans"
            >
              {status === 'loading' ? 'Signing in...' : 'Sign In'}
            </button>

            {status === 'error' && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
                {message}
              </div>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-foreground/40">
          Voca is invite-only during the beta.{' '}
          <a href="/#join" className="text-accent-amber hover:underline">Join the waitlist</a> for access.
        </p>
      </div>
    </div>
  )
}

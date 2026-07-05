'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { acceptInvite, acceptInviteSignIn, acceptInviteNewAccount } from '@/lib/actions/members'
import { createClient } from '@/lib/supabase/client'

type Props = {
  token: string
  mode: 'accept' | 'mismatch' | 'signin' | 'create'
  inviteEmail: string
  currentEmail: string | null
  role: 'moderator' | 'viewer'
}

const inputCls = 'block w-full rounded-xl border-0 bg-background/50 py-3 px-4 text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 placeholder:text-foreground/30 focus:ring-2 focus:ring-inset focus:ring-accent-amber sm:text-sm sm:leading-6 transition-all'
const buttonCls = 'flex w-full justify-center items-center gap-2 rounded-full bg-accent-amber px-6 py-3 text-sm font-semibold text-black shadow-sm hover:opacity-90 disabled:opacity-50 transition-all'

export default function InviteAccept({ token, mode, inviteEmail, currentEmail, role }: Props) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(action: () => Promise<{ success?: boolean; formId?: string; error?: string }>) {
    setBusy(true)
    setError('')
    const res = await action()
    if (res.error || !res.success) {
      setError(res.error ?? 'Something went wrong.')
      setBusy(false)
      return
    }
    router.push(`/admin/forms/${res.formId}`)
    router.refresh()
  }

  const roleBlurb = role === 'moderator'
    ? 'You will be able to edit the form, manage settings, and see all responses.'
    : 'You will be able to see responses and analytics, read-only.'

  return (
    <div className="bg-foreground/[0.03] border border-foreground/[0.08] py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10">
      <p className="text-sm text-foreground/60 mb-6">{roleBlurb}</p>

      {mode === 'accept' && (
        <button className={buttonCls} disabled={busy} onClick={() => run(() => acceptInvite(token))}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Accept invitation
        </button>
      )}

      {mode === 'mismatch' && (
        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            You&rsquo;re signed in as <span className="font-medium">{currentEmail}</span>, but this
            invite was sent to <span className="font-medium">{inviteEmail}</span>.
          </p>
          <button
            className={buttonCls}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              // Browser-side sign-out keeps us ON this invite page
              await createClient().auth.signOut()
              window.location.reload()
            }}
          >
            Sign out and switch account
          </button>
        </div>
      )}

      {(mode === 'signin' || mode === 'create') && (
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault()
            run(() => mode === 'signin'
              ? acceptInviteSignIn(token, password)
              : acceptInviteNewAccount(token, password))
          }}
        >
          <div>
            <label className="block text-sm font-medium leading-6 text-foreground">Email</label>
            <div className="mt-2">
              <input value={inviteEmail} disabled className={`${inputCls} opacity-60`} />
            </div>
          </div>
          <div>
            <label htmlFor="invite-password" className="block text-sm font-medium leading-6 text-foreground">
              {mode === 'signin' ? 'Your password' : 'Choose a password'}
            </label>
            <div className="mt-2">
              <input
                id="invite-password"
                type="password"
                required
                minLength={mode === 'create' ? 8 : undefined}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signin' ? '••••••••' : 'At least 8 characters'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            {mode === 'signin' && (
              <p className="mt-2 text-xs text-foreground/45">You already have a Voca account with this email — sign in to accept.</p>
            )}
          </div>
          <button type="submit" className={buttonCls} disabled={busy || !password}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {mode === 'signin' ? 'Sign in and accept' : 'Create account and accept'}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
          {error}
        </div>
      )}
    </div>
  )
}

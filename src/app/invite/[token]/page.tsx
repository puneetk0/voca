import { createHash } from 'crypto'
import type { Metadata } from 'next'
import { Mic2, MailX } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import InviteAccept from './_components/InviteAccept'

export const metadata: Metadata = {
  title: 'Team invitation — Voca',
  robots: { index: false },
}

function InviteNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen flex-col justify-center py-12 px-6 bg-background">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="flex justify-center text-foreground/25 mb-6">
          <MailX className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-foreground/60">{message}</p>
      </div>
    </div>
  )
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Token is the credential; the DB only ever sees its hash.
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: invite } = await supabaseAdmin
    .from('form_invites')
    .select('id, form_id, email, role, expires_at, accepted_at, invited_by, forms(title)')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invite) {
    return <InviteNotice title="Invite not found" message="This invitation link is invalid. Ask the form owner to send you a fresh one." />
  }
  if (invite.accepted_at) {
    return <InviteNotice title="Already accepted" message="This invitation has already been used. Sign in to see the form on your dashboard." />
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return <InviteNotice title="Invite expired" message="This invitation has expired (links last 7 days). Ask the form owner to send you a fresh one." />
  }

  const formTitle = (invite as any).forms?.title ?? 'a form'
  const { data: inviter } = invite.invited_by
    ? await supabaseAdmin.from('users').select('email').eq('id', invite.invited_by).maybeSingle()
    : { data: null }

  // Which acceptance path applies?
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let mode: 'accept' | 'mismatch' | 'signin' | 'create'
  if (user) {
    mode = user.email?.toLowerCase() === invite.email ? 'accept' : 'mismatch'
  } else {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', invite.email)
      .maybeSingle()
    mode = existing ? 'signin' : 'create'
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-accent-amber mb-6">
          <Mic2 className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight text-foreground">
          You&rsquo;re invited to &ldquo;{formTitle}&rdquo;
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/60">
          {inviter?.email ?? 'The form owner'} invited <span className="font-medium text-foreground/80">{invite.email}</span> as a{' '}
          <span className="font-medium text-accent-amber">{invite.role}</span>.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]">
        <InviteAccept
          token={token}
          mode={mode}
          inviteEmail={invite.email}
          currentEmail={user?.email ?? null}
          role={invite.role}
        />
      </div>
    </div>
  )
}

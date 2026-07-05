'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, X, RotateCw, Clock } from 'lucide-react'
import { inviteMember, revokeInvite, removeMember, changeMemberRole, type MemberRole } from '@/lib/actions/members'

export type MemberRow = { userId: string; email: string; role: MemberRole; since: string }
export type InviteRow = { id: string; email: string; role: MemberRole; expiresAt: string; expired: boolean }

interface Props {
  formId: string
  members: MemberRow[]
  invites: InviteRow[]
}

const ROLES: { value: MemberRole; label: string; hint: string }[] = [
  { value: 'viewer', label: 'Viewer', hint: 'Sees responses and analytics, read-only' },
  { value: 'moderator', label: 'Moderator', hint: 'Can edit the form and manage settings' },
]

export default function MembersPanel({ formId, members, invites }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('viewer')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  function act(key: string, fn: () => Promise<{ success?: boolean; error?: string }>, okText?: string) {
    setBusyKey(key)
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      setBusyKey(null)
      if (res.error) setMsg({ ok: false, text: res.error })
      else {
        if (okText) setMsg({ ok: true, text: okText })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Add member */}
      <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-foreground">Invite someone</h3>
        <p className="text-xs text-foreground/50 mt-1 mb-4">
          They&rsquo;ll get an email with a link — no Voca account needed beforehand.
        </p>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={e => {
            e.preventDefault()
            if (!email.trim()) return
            act('invite', () => inviteMember(formId, email, role), `Invite sent to ${email.trim().toLowerCase()}.`)
            setEmail('')
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className="flex-1 rounded-xl bg-background border border-foreground/10 px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent-amber/50 focus:outline-none transition-colors"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as MemberRole)}
            className="rounded-xl bg-foreground/[0.03] border border-foreground/10 px-3 py-2.5 text-sm focus:ring-0"
            title={ROLES.find(r => r.value === role)?.hint}
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button
            type="submit"
            disabled={pending || !email.trim()}
            className="flex items-center justify-center gap-2 rounded-full bg-accent-amber px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busyKey === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </button>
        </form>
        <p className="text-xs text-foreground/40 mt-3">
          {ROLES.map(r => `${r.label}: ${r.hint.toLowerCase()}`).join(' · ')}
        </p>
        {msg && (
          <p className={`mt-3 text-xs ${msg.ok ? 'text-accent-sage' : 'text-red-400'}`}>{msg.text}</p>
        )}
      </div>

      {/* Members */}
      <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Team</h3>
        {members.length === 0 ? (
          <p className="text-xs text-foreground/35 italic">No team members yet. You&rsquo;re flying solo.</p>
        ) : (
          <ul className="divide-y divide-foreground/[0.06]">
            {members.map(m => (
              <li key={m.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-amber/10 text-xs font-semibold text-accent-amber uppercase">
                  {m.email.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/80">{m.email}</span>
                <select
                  value={m.role}
                  disabled={pending}
                  onChange={e => act(`role-${m.userId}`, () => changeMemberRole(formId, m.userId, e.target.value as MemberRole))}
                  className="rounded-lg bg-foreground/[0.03] border border-foreground/10 px-2 py-1 text-xs focus:ring-0"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.email}? They'll immediately lose access to this form.`)) {
                      act(`rm-${m.userId}`, () => removeMember(formId, m.userId))
                    }
                  }}
                  className="p-1.5 text-foreground/30 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-all"
                  title="Remove member"
                >
                  {busyKey === `rm-${m.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-foreground/[0.02] border border-foreground/10 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pending invites</h3>
          <ul className="divide-y divide-foreground/[0.06]">
            {invites.map(i => (
              <li key={i.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Clock className="h-4 w-4 shrink-0 text-foreground/25" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/70">{i.email}</span>
                <span className="shrink-0 text-xs text-foreground/40 capitalize">{i.role}</span>
                <span className={`shrink-0 text-xs ${i.expired ? 'text-red-400' : 'text-foreground/35'}`}>
                  {i.expired ? 'Expired' : `Expires ${new Date(i.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </span>
                <button
                  disabled={pending}
                  onClick={() => act(`resend-${i.id}`, () => inviteMember(formId, i.email, i.role), `Invite re-sent to ${i.email}.`)}
                  className="p-1.5 text-foreground/30 hover:text-accent-amber rounded-lg hover:bg-accent-amber/10 transition-all"
                  title="Resend invite (issues a fresh link)"
                >
                  {busyKey === `resend-${i.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                </button>
                <button
                  disabled={pending}
                  onClick={() => act(`revoke-${i.id}`, () => revokeInvite(formId, i.id))}
                  className="p-1.5 text-foreground/30 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-all"
                  title="Revoke invite"
                >
                  {busyKey === `revoke-${i.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

'use server'

import { createHash, randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireFormRole } from '@/lib/authz'
import { sendTeamInvite } from '@/lib/email'
import { checkLimit, clientIp } from '@/lib/ratelimit'

// Team membership management. Everything here is owner-only except the
// accept-invite flows, where the token itself is the credential.

export type MemberRole = 'moderator' | 'viewer'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PENDING_INVITES = 10

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://vocaforms.tech'
}

// ── Owner-side management ─────────────────────────────────────────────

export async function inviteMember(formId: string, rawEmail: string, role: MemberRole) {
  try {
    const { user, form } = await requireFormRole(formId, 'owner')
    if (role !== 'moderator' && role !== 'viewer') throw new Error('Invalid role.')

    const email = (rawEmail ?? '').toLowerCase().trim()
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      throw new Error('Enter a valid email address.')
    }
    if (email === user.email?.toLowerCase()) {
      throw new Error("That's you — owners already have full access.")
    }

    // Sending email costs money and tokens gate access — rate limit hard.
    const ip = clientIp(await headers())
    const allowed = await checkLimit(null, `invite_${ip}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!allowed) throw new Error('Too many invites at once. Try again in a few minutes.')

    // Already a member? (look the account up by email first)
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingUser) {
      const { data: membership } = await supabaseAdmin
        .from('form_members')
        .select('role')
        .eq('form_id', formId)
        .eq('user_id', existingUser.id)
        .maybeSingle()
      if (membership) throw new Error(`${email} is already a ${membership.role} on this form.`)
    }

    // Cap pending invites per form
    const { count } = await supabaseAdmin
      .from('form_invites')
      .select('id', { count: 'exact', head: true })
      .eq('form_id', formId)
      .is('accepted_at', null)
    if ((count ?? 0) >= MAX_PENDING_INVITES) {
      throw new Error(`This form already has ${MAX_PENDING_INVITES} pending invites. Revoke one first.`)
    }

    // Fresh token every time; re-inviting the same email refreshes token,
    // role, and expiry — which doubles as "resend invite".
    const rawToken = randomBytes(32).toString('base64url')
    const { error } = await supabaseAdmin
      .from('form_invites')
      .upsert({
        form_id: formId,
        email,
        role,
        token_hash: hashToken(rawToken),
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
        accepted_at: null,
      }, { onConflict: 'form_id,email' })
    if (error) throw new Error(error.message)

    const { sent } = await sendTeamInvite({
      toEmail: email,
      formTitle: form.title,
      inviterEmail: user.email ?? 'A Voca user',
      role,
      inviteUrl: `${appUrl()}/invite/${rawToken}`,
    })
    if (!sent) {
      throw new Error('The invite was created but the email failed to send. Use "Resend" to retry.')
    }

    revalidatePath(`/admin/forms/${formId}`)
    return { success: true }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function revokeInvite(formId: string, inviteId: string) {
  try {
    await requireFormRole(formId, 'owner')
    const { error } = await supabaseAdmin
      .from('form_invites')
      .delete()
      .eq('id', inviteId)
      .eq('form_id', formId)
      .is('accepted_at', null)
    if (error) throw new Error(error.message)
    revalidatePath(`/admin/forms/${formId}`)
    return { success: true }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function removeMember(formId: string, memberUserId: string) {
  try {
    await requireFormRole(formId, 'owner')
    const { error } = await supabaseAdmin
      .from('form_members')
      .delete()
      .eq('form_id', formId)
      .eq('user_id', memberUserId)
    if (error) throw new Error(error.message)
    // Also clear their accepted invite so the same email can be re-invited
    const { data: removed } = await supabaseAdmin
      .from('users').select('email').eq('id', memberUserId).maybeSingle()
    if (removed?.email) {
      await supabaseAdmin.from('form_invites').delete()
        .eq('form_id', formId).eq('email', removed.email.toLowerCase())
    }
    revalidatePath(`/admin/forms/${formId}`)
    return { success: true }
  } catch (e: any) {
    return { error: e.message }
  }
}

export async function changeMemberRole(formId: string, memberUserId: string, role: MemberRole) {
  try {
    await requireFormRole(formId, 'owner')
    if (role !== 'moderator' && role !== 'viewer') throw new Error('Invalid role.')
    const { error } = await supabaseAdmin
      .from('form_members')
      .update({ role })
      .eq('form_id', formId)
      .eq('user_id', memberUserId)
    if (error) throw new Error(error.message)
    revalidatePath(`/admin/forms/${formId}`)
    return { success: true }
  } catch (e: any) {
    return { error: e.message }
  }
}

/** Members + pending invites for the owner's Members panel. */
export async function getMembersData(formId: string) {
  await requireFormRole(formId, 'owner')

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabaseAdmin
      .from('form_members')
      .select('user_id, role, created_at, invited_by')
      .eq('form_id', formId)
      .order('created_at'),
    supabaseAdmin
      .from('form_invites')
      .select('id, email, role, expires_at, created_at')
      .eq('form_id', formId)
      .is('accepted_at', null)
      .order('created_at'),
  ])

  // Resolve member emails (users table mirrors auth)
  const ids = (members ?? []).map(m => m.user_id)
  const { data: userRows } = ids.length > 0
    ? await supabaseAdmin.from('users').select('id, email').in('id', ids)
    : { data: [] as { id: string; email: string }[] }
  const emailById = new Map((userRows ?? []).map(u => [u.id, u.email]))

  return {
    members: (members ?? []).map(m => ({
      userId: m.user_id,
      email: emailById.get(m.user_id) ?? 'unknown',
      role: m.role as MemberRole,
      since: m.created_at,
    })),
    invites: (invites ?? []).map(i => ({
      id: i.id,
      email: i.email,
      role: i.role as MemberRole,
      expiresAt: i.expires_at,
      expired: new Date(i.expires_at).getTime() < Date.now(),
    })),
  }
}

// ── Invitee-side acceptance (token is the credential) ─────────────────

type InviteRow = {
  id: string
  form_id: string
  email: string
  role: MemberRole
  expires_at: string
  accepted_at: string | null
}

async function findValidInvite(rawToken: string): Promise<InviteRow | null> {
  if (!rawToken || rawToken.length > 128) return null
  const { data } = await supabaseAdmin
    .from('form_invites')
    .select('id, form_id, email, role, expires_at, accepted_at')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle()
  if (!data || data.accepted_at || new Date(data.expires_at).getTime() < Date.now()) return null
  return data as InviteRow
}

async function grantMembership(invite: InviteRow, userId: string) {
  const { error } = await supabaseAdmin
    .from('form_members')
    .upsert({
      form_id: invite.form_id,
      user_id: userId,
      role: invite.role,
      invited_by: null,
    }, { onConflict: 'form_id,user_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  await supabaseAdmin
    .from('form_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)
}

/** Accept while signed in — the session email must match the invite. */
export async function acceptInvite(rawToken: string) {
  try {
    const invite = await findValidInvite(rawToken)
    if (!invite) throw new Error('This invite is invalid or has expired.')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sign in first to accept this invite.')
    if (user.email?.toLowerCase() !== invite.email) {
      throw new Error(`This invite was sent to ${invite.email}. Sign out and use that account.`)
    }

    await grantMembership(invite, user.id)
    return { success: true, formId: invite.form_id }
  } catch (e: any) {
    return { error: e.message }
  }
}

/**
 * Accept with password sign-in (existing account, not signed in).
 * Rate limited — this is a password oracle otherwise.
 */
export async function acceptInviteSignIn(rawToken: string, password: string) {
  try {
    const ip = clientIp(await headers())
    const allowed = await checkLimit(null, `invite_signin_${ip}`, { limit: 8, windowMs: 10 * 60_000 })
    if (!allowed) throw new Error('Too many attempts. Try again in a few minutes.')

    const invite = await findValidInvite(rawToken)
    if (!invite) throw new Error('This invite is invalid or has expired.')

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: invite.email, password })
    if (error || !data.user) throw new Error('Wrong password for ' + invite.email)

    await grantMembership(invite, data.user.id)
    return { success: true, formId: invite.form_id }
  } catch (e: any) {
    return { error: e.message }
  }
}

/**
 * Accept by creating a brand-new account. This is the ONLY path that mints
 * accounts outside the (blocked) beta signup — gated by a valid invite token.
 */
export async function acceptInviteNewAccount(rawToken: string, password: string) {
  try {
    const ip = clientIp(await headers())
    const allowed = await checkLimit(null, `invite_signup_${ip}`, { limit: 5, windowMs: 10 * 60_000 })
    if (!allowed) throw new Error('Too many attempts. Try again in a few minutes.')

    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.')

    const invite = await findValidInvite(rawToken)
    if (!invite) throw new Error('This invite is invalid or has expired.')

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', invite.email)
      .maybeSingle()
    if (existing) throw new Error('An account with this email already exists. Sign in instead.')

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true, // the invite email already proved inbox ownership
    })
    if (createErr || !created.user) throw new Error(createErr?.message ?? 'Could not create the account.')

    // handle_new_user trigger mirrors into public.users; sign them in to set cookies
    const supabase = await createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: invite.email, password })
    if (signInErr) throw new Error(signInErr.message)

    await grantMembership(invite, created.user.id)
    return { success: true, formId: invite.form_id }
  } catch (e: any) {
    return { error: e.message }
  }
}

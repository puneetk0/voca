import { createClient } from '@/lib/supabase/server'

// Per-form authorization. Owner is forms.user_id; moderators/viewers live in
// form_members (migration 0004). Every server action and admin page resolves
// its role through here — RLS is the second line of defense underneath.

export type FormRole = 'owner' | 'moderator' | 'viewer'

const RANK: Record<FormRole, number> = { viewer: 1, moderator: 2, owner: 3 }

export type FormAccess = {
  user: { id: string; email?: string }
  form: { id: string; user_id: string; title: string }
  role: FormRole
}

/**
 * Resolve the current user's role on a form. Returns null when not signed in,
 * the form doesn't exist, or the user has no membership.
 */
export async function getFormRole(formId: string): Promise<FormAccess | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: form } = await supabase
    .from('forms')
    .select('id, user_id, title')
    .eq('id', formId)
    .single()
  if (!form) return null

  if (form.user_id === user.id) {
    return { user: { id: user.id, email: user.email ?? undefined }, form, role: 'owner' }
  }

  const { data: membership } = await supabase
    .from('form_members')
    .select('role')
    .eq('form_id', formId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.role === 'moderator' || membership?.role === 'viewer') {
    return { user: { id: user.id, email: user.email ?? undefined }, form, role: membership.role }
  }
  return null
}

/**
 * Like getFormRole but throws when access is missing or below `min`.
 * Use in server actions; pages usually branch on getFormRole themselves.
 */
export async function requireFormRole(formId: string, min: FormRole): Promise<FormAccess> {
  const access = await getFormRole(formId)
  if (!access || RANK[access.role] < RANK[min]) throw new Error('Unauthorized')
  return access
}

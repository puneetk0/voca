'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function authenticateWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const mode = formData.get('mode') as 'login' | 'signup'
  const supabase = await createClient()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  // Invite-only beta: signups are disabled server-side (not just hidden in
  // the UI). Accounts are provisioned manually for now.
  if (mode === 'signup') {
    return { error: 'Voca is invite-only during the beta. Join the waitlist for access.' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/')
  redirect('/')
}

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

  if (mode === 'signup') {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    if (!data.session) {
      return { error: 'Account created safely! However, you must check your email to verify (or disable "Confirm Email" in your Supabase Auth Settings to login instantly).' }
    }
    return { success: true, isNewUser: true }
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

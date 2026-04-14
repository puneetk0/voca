'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function loginWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createClient()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  let { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error && error.message.includes('Invalid login credentials')) {
    const signUpRes = await supabase.auth.signUp({ email, password })
    error = signUpRes.error
    
    if (!error && !signUpRes.data.session) {
      return { error: 'Account created safely! However, you must check your email to verify (or disable "Confirm Email" in your Supabase Auth Settings to login instantly).' }
    }
  }

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

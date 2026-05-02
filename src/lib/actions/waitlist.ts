'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'

export async function joinWaitlist(
  email: string,
): Promise<{ success?: boolean; error?: string }> {
  // Basic email format validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { error: 'Please enter a valid email address.' }
  }

  const { error } = await supabaseAdmin
    .from('waitlist')
    .insert({ email: email.toLowerCase().trim(), source: 'landing_page' })

  if (error) {
    // Unique constraint violation = already on the list
    if (error.code === '23505') {
      return { error: "You're already on the list! Puneet will be in touch soon." }
    }
    console.error('[Waitlist] Insert error:', error)
    return { error: 'Something went wrong. Please try again in a moment.' }
  }

  return { success: true }
}

'use server'

import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendWaitlistWelcome } from '@/lib/email'
import { checkLimit, clientIp } from '@/lib/ratelimit'

export async function joinWaitlist(
  email: string,
): Promise<{ success?: boolean; error?: string }> {
  const cleaned = (email ?? '').toLowerCase().trim()

  // Basic format + sanity caps (RFC max address length is 254)
  if (!cleaned || cleaned.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { error: 'Please enter a valid email address.' }
  }

  // Spam guard: a person joins a waitlist once, not fifty times a minute.
  const ip = clientIp(await headers())
  const allowed = await checkLimit(null, `waitlist_${ip}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!allowed) {
    return { error: 'Too many attempts. Please try again in a few minutes.' }
  }

  const { error } = await supabaseAdmin
    .from('waitlist')
    .insert({ email: cleaned, source: 'landing_page' })

  if (error) {
    // Unique constraint violation = already on the list (no second email)
    if (error.code === '23505') {
      return { error: "You're already on the list! We'll be in touch soon." }
    }
    console.error('[Waitlist] Insert error:', error)
    return { error: 'Something went wrong. Please try again in a moment.' }
  }

  // First successful join → branded welcome (fire and forget; the signup
  // must never fail because the email provider hiccuped)
  sendWaitlistWelcome(cleaned).catch(err =>
    console.error('[Waitlist] Welcome email failed:', err?.message),
  )

  return { success: true }
}

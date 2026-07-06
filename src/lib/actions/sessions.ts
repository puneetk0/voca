'use server'

import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkLimit, clientIp } from '@/lib/ratelimit'
import type { DeviceInfo } from '@/lib/device'

// Session writes use the service role (respondents are anonymous), mirroring
// how submit.ts persists responses. RLS only exposes SELECT to form owners.

export async function startFormSession(formId: string, device: DeviceInfo, totalFields: number) {
  try {
    // Anonymous insert — throttle per IP and verify the form is real so a
    // script can't fill the table with junk rows for made-up form ids.
    const ip = clientIp(await headers())
    const allowed = await checkLimit(null, `session_${ip}`, { limit: 60, windowMs: 10 * 60_000 })
    if (!allowed) return { error: 'rate_limited' }

    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, is_active')
      .eq('id', formId)
      .single()
    if (!form || !form.is_active) return { error: 'invalid_form' }

    const { data, error } = await supabaseAdmin
      .from('form_sessions')
      .insert({
        form_id: formId,
        total_fields: Math.max(0, Math.min(200, Math.floor(totalFields) || 0)),
        last_field_index: 0,
        device_type: String(device?.device_type ?? '').slice(0, 40),
        browser: String(device?.browser ?? '').slice(0, 40),
        os: String(device?.os ?? '').slice(0, 40),
        user_agent: String(device?.user_agent ?? '').slice(0, 400),
      })
      .select('id')
      .single()

    if (error) return { error: error.message }
    return { sessionId: data.id as string }
  } catch (e: any) {
    return { error: e.message }
  }
}

/** Record the furthest question reached (drop-off point). Fire-and-forget. */
export async function updateSessionProgress(sessionId: string, lastFieldIndex: number) {
  try {
    // Session ids are unguessable UUIDv4s; clamp the value regardless.
    const clamped = Math.max(0, Math.min(200, Math.floor(lastFieldIndex) || 0))
    await supabaseAdmin
      .from('form_sessions')
      .update({ last_field_index: clamped })
      .eq('id', sessionId)
  } catch {
    // best-effort — never surface to the respondent
  }
}

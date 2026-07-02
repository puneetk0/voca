'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { DeviceInfo } from '@/lib/device'

// Session writes use the service role (respondents are anonymous), mirroring
// how submit.ts persists responses. RLS only exposes SELECT to form owners.

export async function startFormSession(formId: string, device: DeviceInfo, totalFields: number) {
  try {
    const { data, error } = await supabaseAdmin
      .from('form_sessions')
      .insert({
        form_id: formId,
        total_fields: totalFields,
        last_field_index: 0,
        device_type: device.device_type,
        browser: device.browser,
        os: device.os,
        user_agent: device.user_agent,
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
    await supabaseAdmin
      .from('form_sessions')
      .update({ last_field_index: lastFieldIndex })
      .eq('id', sessionId)
  } catch {
    // best-effort — never surface to the respondent
  }
}

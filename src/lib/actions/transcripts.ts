'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { getFormRole } from '@/lib/authz'

export type TranscriptMessage = { id?: string; role: string; text: string }

// Defense in depth: RLS already restricts transcripts to form members, but
// we verify access explicitly too — a misconfigured policy must not turn
// into a data leak. Viewers and above may read transcripts.
export async function getResponseTranscript(responseId: string) {
  try {
    const { data: row } = await supabaseAdmin
      .from('responses')
      .select('form_id')
      .eq('id', responseId)
      .single()
    if (!row?.form_id) return { messages: null }

    const access = await getFormRole(row.form_id)
    if (!access) return { messages: null }

    const { data } = await supabaseAdmin
      .from('transcripts')
      .select('messages')
      .eq('response_id', responseId)
      .single()
    const messages = Array.isArray(data?.messages) ? (data!.messages as TranscriptMessage[]) : null
    return { messages }
  } catch {
    return { messages: null }
  }
}

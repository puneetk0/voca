'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type TranscriptMessage = { id?: string; role: string; text: string }

// Defense in depth: RLS already restricts transcripts to the form owner, but
// we verify ownership explicitly too — a misconfigured policy must not turn
// into a data leak.
export async function getResponseTranscript(responseId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { messages: null }

    const { data: row } = await supabaseAdmin
      .from('responses')
      .select('form_id, forms!inner(user_id)')
      .eq('id', responseId)
      .single()
    const ownerId = (row as any)?.forms?.user_id
    if (!ownerId || ownerId !== user.id) return { messages: null }

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

'use server'

import { createClient } from '@/lib/supabase/server'

export type TranscriptMessage = { id?: string; role: string; text: string }

// RLS ("Form owners can view transcripts") restricts this to the form owner,
// so no explicit ownership check is needed here.
export async function getResponseTranscript(responseId: string) {
  try {
    const supabase = await createClient()
    const { data } = await supabase
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

'use server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function submitResponse(
  formId: string, 
  inputMethod: 'voice' | 'text', 
  answers: Record<string, string>, 
  history: any[]
) {
  const supabase = supabaseAdmin

  // 1. Insert Response
  const { data: response, error: responseErr } = await supabase
    .from('responses')
    .insert({ form_id: formId, input_method: inputMethod })
    .select('id')
    .single()

  if (responseErr) throw new Error(responseErr.message)

  // 2. Insert Answers
  const answersToInsert = Object.entries(answers).map(([field_id, value]) => ({
    response_id: response.id,
    field_id,
    value
  }))

  if (answersToInsert.length > 0) {
    const { error: answersErr } = await supabase.from('answers').insert(answersToInsert)
    if (answersErr) console.error('Error inserting answers:', answersErr)
  }

  // 3. Insert Transcript
  const { error: transcriptErr } = await supabase.from('transcripts').insert({
    response_id: response.id,
    messages: history
  })
  if (transcriptErr) console.error('Error inserting transcript:', transcriptErr)

  return { success: true }
}

'use server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function submitResponse(
  formId: string, 
  inputMethod: 'voice' | 'text', 
  answers: Record<string, string>,
  history: any[],
  // Audio blobs serialized to base64 on the client (Blobs can't cross Server Action boundary)
  audioBlobsBase64?: Record<string, string>
) {
  const supabase = supabaseAdmin

  // 1. Insert Response
  const { data: response, error: responseErr } = await supabase
    .from('responses')
    .insert({ form_id: formId, input_method: inputMethod })
    .select('id')
    .single()

  if (responseErr) throw new Error(responseErr.message)

  // 2. Insert Answers (with optional audio URLs)
  const answersToInsert = await Promise.all(
    Object.entries(answers).map(async ([field_id, value]) => {
      let audio_url: string | null = null

      // 2a. Try to upload audio if we have a blob for this field
      if (audioBlobsBase64?.[field_id]) {
        try {
          const base64 = audioBlobsBase64[field_id]
          // Strip data URL prefix if present (e.g. "data:audio/webm;base64,...")
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
          const buffer = Buffer.from(base64Data, 'base64')

          const fileName = `${response.id}_${field_id}.webm`
          const { error: uploadErr } = await supabase.storage
            .from('audio_submissions')
            .upload(fileName, buffer, { contentType: 'audio/webm', upsert: true })

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('audio_submissions')
              .getPublicUrl(fileName)
            audio_url = urlData.publicUrl
          } else {
            console.error(`Audio upload failed for field ${field_id}:`, uploadErr.message)
            // Non-fatal — text answer still saves
          }
        } catch (audioErr) {
          console.error(`Audio processing error for field ${field_id}:`, audioErr)
          // Non-fatal — text answer still saves
        }
      }

      return { response_id: response.id, field_id, value, audio_url }
    })
  )

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

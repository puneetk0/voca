'use server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function submitResponse(formData: FormData) {
  const supabase = supabaseAdmin

  const formId = formData.get('formId') as string
  const inputMethod = formData.get('inputMethod') as string
  const answers = JSON.parse(formData.get('answers') as string)
  const history = JSON.parse(formData.get('history') as string)

  // 1. Insert Response
  const { data: response, error: responseErr } = await supabase
    .from('responses')
    .insert({ form_id: formId, input_method: inputMethod })
    .select('id')
    .single()

  if (responseErr) throw new Error(responseErr.message)

  // Extract all audio blobs from formData
  const audioBlobs: Record<string, Blob> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('audio_') && value instanceof Blob) {
      const fieldId = key.replace('audio_', '')
      audioBlobs[fieldId] = value
    }
  }

  // 2. Insert Answers (with optional audio URLs)
  const answersToInsert = await Promise.all(
    Object.entries(answers).map(async ([field_id, value]) => {
      let audio_url: string | null = null

      // 2a. Try to upload audio if we have a blob for this field
      if (audioBlobs[field_id]) {
        try {
          const blob = audioBlobs[field_id]
          const arrayBuffer = await blob.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          const fileName = `${response.id}/${field_id}_${Date.now()}.webm`
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

      return { response_id: response.id, field_id, value: value as string, audio_url }
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

'use server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function submitResponse(formData: FormData) {
  const supabase = supabaseAdmin

  const formId = formData.get('formId') as string
  const inputMethod = formData.get('inputMethod') as string
  const answers = JSON.parse(formData.get('answers') as string)
  const sentiments = JSON.parse(formData.get('sentiments') as string || '{}')
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

  // 2. Fetch valid field IDs for this form to prevent FK violations
  const { data: validFields } = await supabase
    .from('fields')
    .select('id')
    .eq('form_id', formId)
  
  const validFieldIds = new Set(validFields?.map(f => f.id) || [])

  // 3. Insert Answers (with optional audio URLs)
  const answersToInsert = (await Promise.all(
    Object.entries(answers).map(async ([field_id, value]) => {
      // Skip if Field ID doesn't exist for this form (prevents hallucination errors)
      if (!validFieldIds.has(field_id)) return null

      let audio_url: string | null = null

      // 3a. Try to upload audio if we have a blob for this field
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
          }
        } catch (audioErr) {
          console.error(`Audio processing error for field ${field_id}:`, audioErr)
        }
      }

      const sentiment = sentiments[field_id] || null
      return { response_id: response.id, field_id, value: value as string, audio_url, sentiment }
    })
  )).filter(Boolean) as any[]

  if (answersToInsert.length > 0) {
    const { error: answersErr } = await supabase.from('answers').insert(answersToInsert)
    if (answersErr) {
       console.error('Error inserting answers:', answersErr)
       throw new Error(`Failed to save answers: ${answersErr.message}`)
    }
  }

  // 4. Insert Transcript
  const { error: transcriptErr } = await supabase.from('transcripts').insert({
    response_id: response.id,
    messages: history
  })
  if (transcriptErr) console.error('Error inserting transcript:', transcriptErr)

  return { success: true }
}

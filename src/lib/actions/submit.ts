'use server'
import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendResponseNotification } from '@/lib/email'
import { onPathFieldIds, hasBranching, type BranchField } from '@/lib/branching'

// Server-action throws get MASKED in production (digest only) — the client
// would see a useless generic message. Every failure here returns a coded
// result instead, so the UI can say something true and the user knows whether
// retrying helps.
export type SubmitResult =
  | { success: true; responseId: string }
  | { success: false; error: string; retryable: boolean }

export async function submitResponse(formData: FormData): Promise<SubmitResult> {
  const supabase = supabaseAdmin

  let formId: string, inputMethod: string, sessionId: string | null
  let answers: Record<string, string>, sentiments: Record<string, string>, history: unknown
  try {
    formId = formData.get('formId') as string
    inputMethod = formData.get('inputMethod') as string
    sessionId = (formData.get('sessionId') as string | null) || null
    answers = JSON.parse(formData.get('answers') as string)
    sentiments = JSON.parse(formData.get('sentiments') as string || '{}')
    history = JSON.parse(formData.get('history') as string)
    if (!formId || typeof answers !== 'object' || answers === null) throw new Error('bad payload')
  } catch {
    return { success: false, error: 'The submission data was malformed. Please try again.', retryable: true }
  }

  // 1. Insert Response
  const { data: response, error: responseErr } = await supabase
    .from('responses')
    .insert({ form_id: formId, input_method: inputMethod })
    .select('id')
    .single()

  if (responseErr || !response) {
    console.error('[Submit] response insert failed:', responseErr?.message)
    return { success: false, error: "Couldn't save your response. Please try submitting again.", retryable: true }
  }

  // Extract all audio blobs from formData
  const audioBlobs: Record<string, Blob> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('audio_') && value instanceof Blob) {
      const fieldId = key.replace('audio_', '')
      audioBlobs[fieldId] = value
    }
  }

  // 2. Fetch form info + valid fields in parallel
  const [formResult, fieldsResult] = await Promise.all([
    supabase.from('forms').select('user_id, title, email_notifications').eq('id', formId).single(),
    supabase.from('fields').select('id, label, field_type, options, logic_rules').eq('form_id', formId).order('order_index'),
  ])

  const validFields = fieldsResult.data ?? []
  let validFieldIds = new Set(validFields.map(f => f.id))

  // Branched forms: recompute the taken path server-side and drop answers
  // for fields that aren't on it (e.g. orphaned by a corrected branch choice).
  // Never trust the client to have filtered.
  if (hasBranching(validFields as BranchField[])) {
    const onPath = onPathFieldIds(validFields as BranchField[], answers)
    validFieldIds = new Set([...validFieldIds].filter(id => onPath.has(id)))
  }

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
      // Coerce defensively — a non-string value must never fail the insert
      const cleanValue = typeof value === 'string' ? value : String(value ?? '')
      if (!cleanValue) return null
      return { response_id: response.id, field_id, value: cleanValue, audio_url, sentiment }
    })
  )).filter(Boolean) as any[]

  if (answersToInsert.length > 0) {
    const { error: answersErr } = await supabase.from('answers').insert(answersToInsert)
    if (answersErr) {
      console.error('Error inserting answers:', answersErr)
      // Roll back the response row so a retry doesn't leave a phantom empty
      // response (and a duplicate once the retry succeeds).
      await supabase.from('responses').delete().eq('id', response.id)
      return { success: false, error: "Couldn't save your answers. Please try submitting again.", retryable: true }
    }
  }

  // 4. Insert Transcript
  const { error: transcriptErr } = await supabase.from('transcripts').insert({
    response_id: response.id,
    messages: history
  })
  if (transcriptErr) console.error('Error inserting transcript:', transcriptErr)

  // 4b. Mark the session complete (drop-off analytics). Duration is computed
  //     from the server-recorded started_at to avoid trusting the client clock.
  if (sessionId) {
    try {
      const { data: sess } = await supabase
        .from('form_sessions')
        .select('started_at, total_fields')
        .eq('id', sessionId)
        .single()
      const startedMs = sess?.started_at ? new Date(sess.started_at).getTime() : null
      await supabase.from('form_sessions').update({
        completed_at: new Date().toISOString(),
        duration_ms: startedMs ? Date.now() - startedMs : null,
        response_id: response.id,
        input_method: inputMethod,
        last_field_index: sess?.total_fields ?? null,
      }).eq('id', sessionId)
    } catch (sessErr) {
      console.error('[Session] Failed to mark complete:', sessErr)
    }
  }

  // 5. Email notification — after() keeps the serverless function alive until
  //    it finishes (a bare fire-and-forget promise gets dropped on freeze).
  //    Respect the per-form toggle (defaults to on when the column is null).
  if (formResult.data && formResult.data.email_notifications !== false) {
    const { user_id, title } = formResult.data
    after(async () => {
      try {
        const { data } = await supabase.auth.admin.getUserById(user_id)
        const email = data?.user?.email
        if (!email) return
        await sendResponseNotification({
          toEmail: email,
          formTitle: title,
          formId,
          fields: validFields,
          // Same path filter as the insert — off-path answers stay out of the email
          answers: Object.fromEntries(
            Object.entries(answers).filter(([id]) => validFieldIds.has(id)),
          ),
        })
      } catch (err: any) {
        console.error('[Email] Failed to send response notification:', err?.message)
      }
    })
  }

  return { success: true, responseId: response.id }
}

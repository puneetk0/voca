import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EditForm from '@/components/admin/EditForm'
import type { BuilderSchema } from '@/components/admin/FormBuilder'

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { id } = await params

  // select('*') stays resilient if migration 0002 hasn't run yet
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single()

  if (formError || !form || form.user_id !== user?.id) redirect('/admin')

  const { data: fields } = await supabase
    .from('fields')
    .select('id, label, field_type, required, order_index, options')
    .eq('form_id', id)
    .order('order_index')

  // Per-field response counts (to warn on destructive edits)
  const { data: responses } = await supabase.from('responses').select('id').eq('form_id', id)
  const responseIds = (responses ?? []).map(r => r.id)
  const { data: answerRows } = responseIds.length > 0
    ? await supabase.from('answers').select('field_id').in('response_id', responseIds)
    : { data: [] as { field_id: string }[] }

  const responseCounts: Record<string, number> = {}
  ;(answerRows ?? []).forEach(a => { responseCounts[a.field_id] = (responseCounts[a.field_id] ?? 0) + 1 })

  const initialSchema: BuilderSchema = {
    title: form.title,
    description: form.description ?? '',
    ai_tone: form.ai_tone ?? 'friendly',
    ai_context: form.ai_context ?? '',
    welcome_message: form.welcome_message ?? '',
    default_language: form.default_language === 'hi' ? 'hi' : 'en',
    fields: (fields ?? []).map(f => ({
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : [],
    })),
  }

  return <EditForm formId={id} initialSchema={initialSchema} responseCounts={responseCounts} />
}

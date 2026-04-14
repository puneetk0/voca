'use server'

import { supabaseAdmin } from '@/lib/supabase/admin'

export async function exportFormCSV(formId: string, formTitle: string): Promise<string> {
  // 1. Fetch fields (ordered)
  const { data: fields } = await supabaseAdmin
    .from('fields')
    .select('id, label, order_index')
    .eq('form_id', formId)
    .order('order_index')

  if (!fields || fields.length === 0) throw new Error('No fields found')

  // 2. Fetch all responses
  const { data: responses } = await supabaseAdmin
    .from('responses')
    .select('id, input_method, submitted_at')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: true })

  if (!responses || responses.length === 0) throw new Error('No responses')

  // 3. Fetch all answers for those responses
  const responseIds = responses.map(r => r.id)
  const { data: answers } = await supabaseAdmin
    .from('answers')
    .select('response_id, field_id, value')
    .in('response_id', responseIds)

  const answerMap = new Map<string, string>()
  for (const a of answers ?? []) {
    answerMap.set(`${a.response_id}::${a.field_id}`, a.value)
  }

  // 4. Build CSV — wrap every value in quotes, escape internal quotes
  const safe = (val: string | null | undefined) =>
    `"${(val ?? '').replace(/"/g, '""')}"`

  const header = ['Date', 'Input Method', ...fields.map(f => f.label)].map(safe).join(',')

  const rows = responses.map(r => {
    const date = safe(new Date(r.submitted_at).toLocaleDateString())
    const method = safe(r.input_method)
    const fieldValues = fields.map(f => safe(answerMap.get(`${r.id}::${f.id}`) ?? ''))
    return [date, method, ...fieldValues].join(',')
  })

  return [header, ...rows].join('\n')
}

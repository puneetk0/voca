'use server'

import { createClient } from '@/lib/supabase/server'

interface FieldInput {
  label: string
  field_type: string
  required: boolean
}

export async function saveForm(title: string, description: string, fields: FieldInput[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Transaction-like insert: Form first, then Fields
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .insert({ user_id: user.id, title, description })
    .select('id')
    .single()

  if (formErr) throw new Error(formErr.message)

  const fieldsToInsert = fields.map((f, i) => ({
    form_id: form.id,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    order_index: i
  }))

  const { error: fieldsErr } = await supabase.from('fields').insert(fieldsToInsert)
  
  if (fieldsErr) {
    // Basic rollback attempt
    await supabase.from('forms').delete().eq('id', form.id)
    throw new Error(fieldsErr.message)
  }

  return form.id
}

import { revalidatePath } from 'next/cache'

export async function toggleFormStatus(formId: string, isActive: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Verify ownership
    const { data: form } = await supabase.from('forms').select('user_id').eq('id', formId).single()
    if (form?.user_id !== user.id) throw new Error('Unauthorized')

    const { error } = await supabase
      .from('forms')
      .update({ is_active: isActive })
      .eq('id', formId)

    if (error) throw new Error(error.message)

    revalidatePath(`/admin/forms/${formId}`)
    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function deleteForm(formId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Verify ownership
    const { data: form } = await supabase.from('forms').select('user_id').eq('id', formId).single()
    if (form?.user_id !== user.id) throw new Error('Unauthorized')

    const { error } = await supabase
      .from('forms')
      .delete()
      .eq('id', formId)

    if (error) throw new Error(error.message)

    revalidatePath('/admin')
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'

interface FieldInput {
  id?: string          // present when editing an existing field
  label: string
  field_type: string
  required: boolean
  options?: string[]
}

// Per-form AI personality settings (see migration 0002)
export interface FormPersona {
  ai_tone?: 'professional' | 'friendly' | 'playful'
  ai_context?: string | null
  welcome_message?: string | null
  default_language?: 'en' | 'hi'
}

function personaColumns(persona?: FormPersona) {
  if (!persona) return {}
  return {
    ...(persona.ai_tone ? { ai_tone: persona.ai_tone } : {}),
    ai_context: persona.ai_context?.trim() || null,
    welcome_message: persona.welcome_message?.trim() || null,
    ...(persona.default_language ? { default_language: persona.default_language } : {}),
  }
}

export async function saveForm(title: string, description: string, fields: FieldInput[], persona?: FormPersona) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Transaction-like insert: Form first, then Fields
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .insert({ user_id: user.id, title, description, ...personaColumns(persona) })
    .select('id')
    .single()

  if (formErr) throw new Error(formErr.message)

  if (!fields || fields.length === 0) throw new Error('A form must have at least one field.')

  const fieldsToInsert = fields.map((f, i) => ({
    form_id: form.id,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    order_index: i,
    options: f.options && f.options.length > 0 ? f.options : null,
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

export async function updateForm(
  formId: string,
  title: string,
  description: string,
  fields: FieldInput[],
  persona?: FormPersona,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Verify ownership
    const { data: form } = await supabase.from('forms').select('user_id').eq('id', formId).single()
    if (form?.user_id !== user.id) throw new Error('Unauthorized')

    if (!fields || fields.length === 0) throw new Error('A form must have at least one field.')

    // 1. Update form metadata (+ AI personality when provided)
    const { error: formErr } = await supabase
      .from('forms')
      .update({ title, description, updated_at: new Date().toISOString(), ...personaColumns(persona) })
      .eq('id', formId)
    if (formErr) throw new Error(formErr.message)

    // 2. Diff fields against what's currently stored
    const { data: existing } = await supabase.from('fields').select('id').eq('form_id', formId)
    const existingIds = new Set((existing ?? []).map(f => f.id))
    const incomingIds = new Set(fields.filter(f => f.id).map(f => f.id as string))

    // 2a. Delete fields the user removed (answers cascade-delete with them)
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id))
    if (toDelete.length > 0) {
      const { error } = await supabase.from('fields').delete().in('id', toDelete)
      if (error) throw new Error(error.message)
    }

    // 2b. Update existing fields / insert new ones, rewriting order_index
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const payload = {
        label: f.label,
        field_type: f.field_type,
        required: f.required,
        order_index: i,
        options: f.options && f.options.length > 0 ? f.options : null,
      }
      if (f.id && existingIds.has(f.id)) {
        const { error } = await supabase.from('fields').update(payload).eq('id', f.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('fields').insert({ form_id: formId, ...payload })
        if (error) throw new Error(error.message)
      }
    }

    revalidatePath(`/admin/forms/${formId}`)
    revalidatePath(`/f/${formId}`)
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updateFormSettings(
  formId: string,
  settings: { redirect_url?: string | null; email_notifications?: boolean },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Verify ownership
    const { data: form } = await supabase.from('forms').select('user_id').eq('id', formId).single()
    if (form?.user_id !== user.id) throw new Error('Unauthorized')

    const update: { redirect_url?: string | null; email_notifications?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    }

    if (settings.redirect_url !== undefined) {
      const raw = (settings.redirect_url ?? '').trim()
      if (raw === '') {
        update.redirect_url = null
      } else {
        // Must be a valid absolute http(s) URL
        let parsed: URL
        try {
          parsed = new URL(raw)
        } catch {
          throw new Error('Enter a valid URL (including https://).')
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Redirect URL must start with http:// or https://')
        }
        update.redirect_url = parsed.toString()
      }
    }

    if (settings.email_notifications !== undefined) {
      update.email_notifications = settings.email_notifications
    }

    const { error } = await supabase.from('forms').update(update).eq('id', formId)
    if (error) throw new Error(error.message)

    revalidatePath(`/admin/forms/${formId}`)
    return { success: true, redirect_url: update.redirect_url }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updateFormSlug(formId: string, rawSlug: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Verify ownership
    const { data: form } = await supabase.from('forms').select('user_id').eq('id', formId).single()
    if (form?.user_id !== user.id) throw new Error('Unauthorized')

    // Slugify: lowercase, replace spaces/special chars with hyphens, trim hyphens
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!slug || slug.length < 3) throw new Error('Slug must be at least 3 characters.')

    const { error } = await supabase.from('forms').update({ slug }).eq('id', formId)
    if (error) {
      if (error.code === '23505') throw new Error('That slug is already taken. Try another.')
      throw new Error(error.message)
    }

    revalidatePath(`/admin/forms/${formId}`)
    return { success: true, slug }
  } catch (error: any) {
    return { error: error.message }
  }
}

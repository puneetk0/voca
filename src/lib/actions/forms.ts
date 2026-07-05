'use server'

import { createClient } from '@/lib/supabase/server'
import { validateLogicRules, ANY_OPTION, type LogicRule, type BranchField } from '@/lib/branching'

interface FieldInput {
  id?: string          // present when editing an existing field
  clientKey?: string   // editor-stable identity; branch rule targets reference this
  label: string
  field_type: string
  required: boolean
  options?: string[]
  logic_rules?: LogicRule[]  // goto = clientKey | 'end' | null while editing
}

// Map editor rules (clientKey targets) to DB rules (uuid targets), dropping
// anything unresolvable, then enforce the structural invariants. Backward or
// self targets are the author's mistake — reject loudly instead of guessing.
function resolveLogicRules(
  fields: FieldInput[],
  keyToDbId: Map<string, string>,
): { rulesByKey: Map<string, LogicRule[] | null>; error?: string } {
  const rulesByKey = new Map<string, LogicRule[] | null>()
  const resolved: BranchField[] = fields.map((f, i) => {
    const options = (f.options ?? []).map(o => o.trim().toLowerCase())
    const rules = (Array.isArray(f.logic_rules) ? f.logic_rules : [])
      .filter(r => r && typeof r.option === 'string' && r.goto !== null && r.goto !== undefined)
      // unknown option → silently drop (stale editor state)
      .filter(r => r.option === ANY_OPTION || options.includes(r.option.trim().toLowerCase()))
      .map(r => ({
        option: r.option,
        goto: r.goto === 'end' ? ('end' as const) : (keyToDbId.get(r.goto as string) ?? r.goto),
      }))
      // dangling target (deleted field) → silently drop
      .filter(r => r.goto === 'end' || fields.some(f2 => keyToDbId.get(f2.clientKey ?? f2.id ?? '') === r.goto))
    const key = f.clientKey ?? f.id ?? String(i)
    rulesByKey.set(key, rules.length > 0 ? rules : null)
    return {
      id: keyToDbId.get(key) ?? key,
      label: f.label,
      field_type: f.field_type,
      options: f.options,
      logic_rules: rules,
    } as BranchField
  })

  const errors = validateLogicRules(resolved)
  if (errors.length > 0) return { rulesByKey, error: errors[0] }
  return { rulesByKey }
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

  // Two-pass save: rules can point at fields that don't have uuids yet, so
  // insert first (returned rows match input order), then write the rules.
  const { data: inserted, error: fieldsErr } = await supabase
    .from('fields')
    .insert(fieldsToInsert)
    .select('id')

  if (fieldsErr || !inserted || inserted.length !== fields.length) {
    // Basic rollback attempt
    await supabase.from('forms').delete().eq('id', form.id)
    throw new Error(fieldsErr?.message ?? 'Failed to save fields.')
  }

  const hasRules = fields.some(f => Array.isArray(f.logic_rules) && f.logic_rules.length > 0)
  if (hasRules) {
    const keyToDbId = new Map<string, string>()
    fields.forEach((f, i) => keyToDbId.set(f.clientKey ?? f.id ?? String(i), inserted[i].id))
    const { rulesByKey, error: ruleErr } = resolveLogicRules(fields, keyToDbId)
    if (ruleErr) {
      await supabase.from('forms').delete().eq('id', form.id)
      throw new Error(ruleErr)
    }
    for (let i = 0; i < fields.length; i++) {
      const rules = rulesByKey.get(fields[i].clientKey ?? fields[i].id ?? String(i)) ?? null
      if (!rules) continue
      const { error } = await supabase.from('fields').update({ logic_rules: rules }).eq('id', inserted[i].id)
      if (error) {
        await supabase.from('forms').delete().eq('id', form.id)
        throw new Error(error.message)
      }
    }
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

    // 2b. Update existing fields / insert new ones, rewriting order_index.
    // Pass 1 writes everything except logic_rules while collecting the real
    // uuid for each editor clientKey (new fields only get theirs on insert).
    const keyToDbId = new Map<string, string>()
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      const key = f.clientKey ?? f.id ?? String(i)
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
        keyToDbId.set(key, f.id)
      } else {
        const { data: created, error } = await supabase
          .from('fields')
          .insert({ form_id: formId, ...payload })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        keyToDbId.set(key, created.id)
      }
    }

    // Pass 2: rule targets resolve clientKey → uuid, then persist per field
    // (including clearing rules that were removed in the editor).
    const { rulesByKey, error: ruleErr } = resolveLogicRules(fields, keyToDbId)
    if (ruleErr) throw new Error(ruleErr)
    for (let i = 0; i < fields.length; i++) {
      const key = fields[i].clientKey ?? fields[i].id ?? String(i)
      const { error } = await supabase
        .from('fields')
        .update({ logic_rules: rulesByKey.get(key) ?? null })
        .eq('id', keyToDbId.get(key)!)
      if (error) throw new Error(error.message)
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

'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateAPIKeys } from './validate-keys'

const envGroqKeys = () =>
  [process.env.GROQ_KEY, process.env.GROQ_KEY_2, process.env.GROQ_KEY_3].filter(Boolean) as string[]

const hasPlatformLlm = () =>
  envGroqKeys().length > 0 || !!process.env.CEREBRAS_API_KEY || !!process.env.GEMINI_KEY

/**
 * Cheap presence-only check for the respondent path: does this form's owner
 * have ANY working AI configuration (own Groq key or platform env fallbacks)?
 * No live validation — this runs on every form load.
 */
export async function getFormHealth(formUserId: string): Promise<{ hasAiKeys: boolean }> {
  const { data: keys } = await supabaseAdmin
    .from('user_keys')
    .select('groq_key')
    .eq('user_id', formUserId)
    .single()

  return { hasAiKeys: !!(keys?.groq_key || hasPlatformLlm()) }
}

export type FormHealthReport = {
  error?: string
  /** Can the conversation engine run? */
  llmOk: boolean
  llmDetail: string
  /** Will respondents hear a voice? (browser speech always exists as last resort) */
  ttsOk: boolean
  ttsDetail: string
  hasFields: boolean
  isActive: boolean
}

/**
 * Live health check for the admin dashboard — actually pings the providers.
 * Costs real quota; only ever run on explicit user action.
 */
export async function checkFormHealth(formId: string): Promise<FormHealthReport> {
  const fail = (error: string): FormHealthReport => ({
    error, llmOk: false, llmDetail: '', ttsOk: false, ttsDetail: '', hasFields: false, isActive: false,
  })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Unauthorized')

  const { data: form } = await supabaseAdmin
    .from('forms')
    .select('user_id, is_active')
    .eq('id', formId)
    .single()
  if (!form || form.user_id !== user.id) return fail('Unauthorized')

  const [{ data: keys }, { count: fieldCount }] = await Promise.all([
    supabaseAdmin.from('user_keys').select('groq_key').eq('user_id', form.user_id).single(),
    supabaseAdmin.from('fields').select('id', { count: 'exact', head: true }).eq('form_id', formId),
  ])

  const effectiveGroq = keys?.groq_key || envGroqKeys()[0] || ''
  const effectiveCerebras = process.env.CEREBRAS_API_KEY || ''
  const hasSarvam = !!process.env.SARVAM_API_KEY

  let llmOk = false
  let llmDetail = 'No Groq or Cerebras key configured — add a Groq key in Settings.'

  if (effectiveGroq || effectiveCerebras) {
    const result = await validateAPIKeys(effectiveGroq, effectiveCerebras || undefined)
    const groqOk = !!effectiveGroq && result.groq
    const cerebrasOk = !!effectiveCerebras && !!result.cerebras
    llmOk = groqOk || cerebrasOk
    llmDetail = llmOk
      ? [groqOk ? 'Groq connected' : null, cerebrasOk ? 'Cerebras connected' : null].filter(Boolean).join(' · ')
      : result.groqError || result.cerebrasError || 'AI keys failed validation.'
  }

  const ttsOk = hasSarvam
  const ttsDetail = hasSarvam
    ? 'Sarvam voice active'
    : 'No premium voice configured — respondents will hear the browser voice.'

  return {
    llmOk,
    llmDetail,
    ttsOk,
    ttsDetail,
    hasFields: (fieldCount ?? 0) > 0,
    isActive: !!form.is_active,
  }
}

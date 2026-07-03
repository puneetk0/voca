import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import FormSession from './_components/FormSession'
import { getFormHealth } from '@/lib/actions/health'

/** Static full-screen notice shared by the closed / not-ready states. */
function FormNotice({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight mb-4">{title}</h1>
        <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/10 text-foreground/60 mb-6 font-medium">
          {message}
        </div>
        <p className="text-xs text-foreground/30 font-medium tracking-wide uppercase">Powered by Voca</p>
      </div>
    </main>
  )
}

// cache() deduplicates this call within the same request —
// generateMetadata and the page component both need the form, but only one DB query fires.
const getForm = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data: form } = await supabase
    .from('forms')
    .select('*')
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .single()

  if (!form) {
    // Fallback: try by ID (handles legacy UUIDs used as slugs)
    const { data: formById } = await supabase
      .from('forms')
      .select('*')
      .eq('id', slug)
      .single()
    return formById ?? null
  }
  return form
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const form = await getForm(slug)
  if (!form) return { title: 'Form — Voca' }
  return {
    title: `${form.title} — Voca`,
    description: form.description || `Fill out "${form.title}" — a voice-powered form on Voca.`,
    openGraph: {
      title: form.title,
      description: form.description || `Fill out "${form.title}" on Voca — the voice-first form builder.`,
    },
  }
}

export default async function ResponderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { slug } = await params
  const rawSearch = await searchParams

  const form = await getForm(slug)
  if (!form) return notFound()

  // Preview mode: owner-only (?preview=1). Random respondents can't opt out
  // of analytics, and owners can walk through paused / unfinished forms.
  const isPreview = rawSearch.preview === '1' && !!user && user.id === form.user_id

  if (form.is_active === false && !isPreview) {
    return <FormNotice title={form.title} message="This form is currently closed for new submissions." />
  }

  const { data: fields } = await supabase
    .from('fields')
    .select('id, label, field_type, required, order_index, options, logic_rules')
    .eq('form_id', form.id)
    .order('order_index')

  if (!fields) return notFound()

  // Preflight: block broken forms with a clear message instead of letting the
  // conversation fail turn after turn. Presence-only — no live key validation.
  if (fields.length === 0) {
    return <FormNotice title={form.title} message="This form isn't ready yet — it has no questions. The form creator needs to finish setting it up." />
  }
  const { hasAiKeys } = await getFormHealth(form.user_id)
  if (!hasAiKeys && !isPreview) {
    return <FormNotice title={form.title} message="This form isn't ready yet. The form creator needs to finish setting up its AI before it can take responses." />
  }

  // Prefills flow into the AI prompt — cap count and lengths, strip newlines
  // (an attacker could otherwise smuggle prompt-injection via the URL).
  const { ref: _ref, preview: _preview, ...rawPrefills } = rawSearch
  const prefills = Object.fromEntries(
    Object.entries(rawPrefills)
      .slice(0, 8)
      .map(([k, v]) => [
        k.replace(/[\r\n]/g, ' ').slice(0, 50),
        String(v ?? '').replace(/[\r\n]/g, ' ').slice(0, 150),
      ]),
  )

  return <FormSession form={form} fields={fields} prefills={prefills} userEmail={user?.email} isPreview={isPreview} />
}

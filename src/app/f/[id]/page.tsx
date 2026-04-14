import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FormSession from './_components/FormSession'

export default async function ResponderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const supabase = await createClient()
  const { id } = await params
  const rawSearch = await searchParams

  // Uses RLS: Only active forms are visible to public
  const { data: form } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single()
    
  if (!form) return notFound()

  // Fields are public if form is active
  const { data: fields } = await supabase
    .from('fields')
    .select('*')
    .eq('form_id', id)
    .order('order_index')
    
  if (!fields) return notFound()

  // Strip internal params (Next.js internals, ref tracking) from prefills
  const { ref: _ref, ...prefills } = rawSearch

  return <FormSession form={form} fields={fields} prefills={prefills} />
}

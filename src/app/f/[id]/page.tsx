import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FormSession from './_components/FormSession'

export default async function ResponderPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

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

  return <FormSession form={form} fields={fields} />
}

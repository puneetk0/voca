import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FormSession from './_components/FormSession'

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

  let { data: form } = await supabase
    .from('forms')
    .select('*')
    .eq('slug', slug)
    .single()
    
  if (!form) {
    const { data: formById } = await supabase
      .from('forms')
      .select('*')
      .eq('id', slug)
      .single()
      
    form = formById
  }
    
  if (!form) return notFound()

  if (form.is_active === false) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-serif tracking-tight mb-4">{form.title}</h1>
          <div className="p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/10 text-foreground/60 mb-6 font-medium">
            This form is currently closed for new submissions.
          </div>
          <p className="text-xs text-foreground/30 font-medium tracking-wide uppercase">Powered by Voca</p>
        </div>
      </main>
    )
  }

  // Fields are public if form is active
  const { data: fields } = await supabase
    .from('fields')
    .select('*')
    .eq('form_id', form.id)
    .order('order_index')
    
  if (!fields) return notFound()

  // Strip internal params (Next.js internals, ref tracking) from prefills
  const { ref: _ref, ...prefills } = rawSearch

  return <FormSession form={form} fields={fields} prefills={prefills} userEmail={user?.email} />
}

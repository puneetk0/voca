import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CopyLinkButton } from '@/components/admin/CopyLinkButton'
import { ExportCSVButton } from '@/components/admin/ExportCSVButton'
import ResponsesTable from '@/components/admin/ResponsesTable'
import { ArrowLeft } from 'lucide-react'

export default async function FormDashboard({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { id } = await params

  // Fetch form to ensure ownership
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single()

  if (formError || form.user_id !== user?.id) {
    redirect('/admin')
  }

  // Fetch fields
  const { data: fields } = await supabase.from('fields').select('*').eq('form_id', id).order('order_index')

  // Fetch responses
  const { data: responses } = await supabase
    .from('responses')
    .select('id, input_method, submitted_at')
    .eq('form_id', id)
    .order('submitted_at', { ascending: false })

  // Fetch all answers mapped to this form 
  // (In V1, just fetching all answers for these responses using an IN clause or relying on RLS filter)
  const responseIds = responses?.map(r => r.id) || []
  const { data: _answers } = await supabase
    .from('answers')
    .select('response_id, field_id, value, audio_url')
    .in('response_id', responseIds)

  const answers = _answers || []

  return (
    <main className="max-w-6xl mx-auto py-10 px-6">
      <Link href="/admin" className="text-sm font-medium text-foreground/50 hover:text-foreground flex items-center gap-2 mb-8 transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-serif font-medium tracking-tight mb-2">{form.title}</h1>
          <p className="text-foreground/60">{form.description}</p>
        </div>
        
        <div className="flex flex-col items-start md:items-end gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/40 pl-2">Share Link</span>
          <CopyLinkButton formId={form.id} />
          <ExportCSVButton 
            formId={form.id} 
            formTitle={form.title}
            disabled={!responses || responses.length === 0} 
          />
        </div>
      </div>
      <div className="space-y-6">
        <h2 className="text-xl font-serif font-medium flex items-center gap-2">
          Submissions <span className="bg-foreground/10 text-xs px-2.5 py-0.5 rounded-full font-sans">{responses?.length || 0}</span>
        </h2>
        <ResponsesTable
          formId={form.id}
          fields={fields || []}
          initialResponses={responses || []}
          initialAnswers={answers}
        />
      </div>
    </main>
  )
}

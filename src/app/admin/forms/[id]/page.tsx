import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CopyLinkButton } from '@/components/admin/CopyLinkButton'
import { ArrowLeft, Mic, Keyboard } from 'lucide-react'

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
    .select('response_id, field_id, value')
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
        
        <div className="flex flex-col items-start md:items-end gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/40 pl-2">Share Link</span>
          <CopyLinkButton formId={form.id} />
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-serif font-medium flex items-center gap-2">
          Submissions <span className="bg-foreground/10 text-xs px-2.5 py-0.5 rounded-full font-sans">{responses?.length || 0}</span>
        </h2>

        {!responses || responses.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-foreground/10 rounded-2xl bg-foreground/[0.02]">
            <p className="text-foreground/50 text-sm">No one has responded to this form yet.</p>
            <p className="text-foreground/40 text-xs mt-1">Copy your link above and share it!</p>
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-foreground/[0.03] text-foreground/60 border-b border-foreground/10 uppercase text-xs tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4 font-medium">Date</th>
                  <th scope="col" className="px-6 py-4 font-medium">Input</th>
                  {fields?.map(field => (
                    <th key={field.id} scope="col" className="px-6 py-4 font-medium max-w-[200px] truncate" title={field.label}>
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {responses.map((response) => (
                  <tr key={response.id} className="border-b border-foreground/5 last:border-0 hover:bg-foreground/[0.04] transition-colors">
                    <td className="px-6 py-4 text-foreground/70">
                      {new Date(response.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {response.input_method === 'voice' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-sage/10 px-2.5 py-1 text-xs font-medium text-accent-sage ring-1 ring-inset ring-accent-sage/20">
                          <Mic className="h-3 w-3" /> Voice
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/70 ring-1 ring-inset ring-foreground/20">
                          <Keyboard className="h-3 w-3" /> Text
                        </span>
                      )}
                    </td>
                    {fields?.map(field => {
                      const ans = answers.find(a => a.response_id === response.id && a.field_id === field.id)
                      return (
                        <td key={field.id} className="px-6 py-4 truncate max-w-[200px]" title={ans?.value || ''}>
                          {ans ? (
                            <span className="text-foreground">{ans.value}</span>
                          ) : (
                            <span className="text-foreground/30 italic">Skipped</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

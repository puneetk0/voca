import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, MessageSquare, KeyRound } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch forms
  const { data: forms, error } = await supabase
    .from('forms')
    .select('id, title, created_at, is_active')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

  const { data: keysData } = await supabase.from('user_keys').select('gemini_key, groq_key').eq('user_id', user?.id).single()
  const hasKeys = keysData?.gemini_key && keysData?.groq_key

  return (
    <main className="max-w-5xl mx-auto py-12 px-6">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-3xl font-serif font-medium text-foreground tracking-tight">Your Forms</h1>
        <Link 
          href="/admin/create"
          className="flex items-center gap-2 rounded-full bg-accent-amber px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition-transform hover:scale-105"
        >
          <Plus className="h-4 w-4" />
          Create New Form
        </Link>
      </div>

      {!hasKeys && (
        <div className="mb-8 rounded-2xl bg-accent-amber/10 border border-accent-amber/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center bg-accent-amber/20 rounded-full h-10 w-10 shrink-0">
               <KeyRound className="h-5 w-5 text-accent-amber" />
            </div>
            <div>
              <h3 className="font-medium text-foreground text-sm">Action Required: API Keys Missing</h3>
              <p className="text-sm text-foreground/70 mt-1">You must configure your Groq and Google Gemini API keys in Settings before creating forms.</p>
            </div>
          </div>
          <Link href="/admin/settings" className="shrink-0 bg-accent-amber text-black text-sm font-semibold px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity">
            Configure Keys
          </Link>
        </div>
      )}

      {!forms || forms.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-foreground/20 rounded-2xl">
          <MessageSquare className="h-12 w-12 text-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">No forms yet</h3>
          <p className="mt-2 text-sm text-foreground/60 max-w-sm mx-auto">
            Get started by creating a form. Just describe what you want to collect using natural language.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Link 
              key={form.id} 
              href={`/admin/forms/${form.id}`}
              className="bg-foreground/[0.02] border border-foreground/10 p-6 rounded-2xl hover:bg-foreground/[0.05] hover:border-foreground/20 transition-all group relative overflow-hidden"
            >
              <h3 className="font-serif text-xl font-medium tracking-tight mb-2 pr-8">{form.title}</h3>
              <p className="text-xs text-foreground/50">
                Created {new Date(form.created_at).toLocaleDateString()}
              </p>
              
              <div className="mt-8 flex items-center justify-between">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${form.is_active ? 'bg-accent-sage/10 text-accent-sage ring-accent-sage/20' : 'bg-foreground/10 text-foreground/70 ring-foreground/20'}`}>
                  {form.is_active ? 'Active' : 'Draft'}
                </span>
                <span className="text-accent-amber text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  View <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

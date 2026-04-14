import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, MessageSquare } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch forms
  const { data: forms, error } = await supabase
    .from('forms')
    .select('id, title, created_at, is_active')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

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

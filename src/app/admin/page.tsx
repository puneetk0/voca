import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, MessageSquare, Users } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Owned forms + forms shared via team membership. Keep the .eq on the owned
  // query — the public "active forms" SELECT policy would otherwise leak every
  // active form on the platform into this list.
  const [{ data: ownedForms }, { data: memberships }] = await Promise.all([
    supabase
      .from('forms')
      .select('id, title, created_at, is_active, responses(count)')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('form_members')
      .select('role, forms(id, title, created_at, is_active, responses(count))'),
  ])

  type FormCard = { id: string; title: string; created_at: string; is_active: boolean; responses?: { count: number }[]; sharedRole?: string }
  const shared: FormCard[] = (memberships ?? [])
    .map((m: any) => (m.forms ? { ...m.forms, sharedRole: m.role } : null))
    .filter(Boolean) as FormCard[]
  const forms: FormCard[] = [
    ...((ownedForms ?? []) as FormCard[]),
    ...shared.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
  ]

  return (
    <main className="max-w-5xl mx-auto py-10 px-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Your Forms</h1>
          <p className="text-sm text-foreground/50 mt-0.5">{forms?.length ?? 0} form{forms?.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/admin/create"
          className="flex items-center gap-2 rounded-full bg-accent-amber px-5 py-2.5 text-sm font-semibold text-black shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Form
        </Link>
      </div>

      {!forms || forms.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-foreground/15 rounded-2xl">
          <MessageSquare className="h-10 w-10 text-foreground/20 mx-auto mb-4" />
          <h3 className="text-base font-medium text-foreground">No forms yet</h3>
          <p className="mt-2 text-sm text-foreground/50 max-w-xs mx-auto">
            Create your first voice form in 30 seconds — just describe what you want to collect.
          </p>
          <Link href="/admin/create" className="inline-flex items-center gap-2 mt-6 rounded-full bg-accent-amber px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Create your first form
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => {
            const count = (form as any).responses?.[0]?.count ?? 0
            return (
              <Link
                key={form.id}
                href={`/admin/forms/${form.id}`}
                className="bg-foreground/[0.02] border border-foreground/[0.08] p-5 rounded-2xl hover:border-foreground/20 hover:-translate-y-0.5 hover:bg-foreground/[0.04] transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${form.is_active ? 'bg-accent-sage/10 text-accent-sage ring-accent-sage/20' : 'bg-foreground/8 text-foreground/50 ring-foreground/15'}`}>
                      {form.is_active ? 'Active' : 'Draft'}
                    </span>
                    {form.sharedRole && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-amber/10 px-2.5 py-0.5 text-xs font-medium text-accent-amber ring-1 ring-inset ring-accent-amber/20" title={`Shared with you as ${form.sharedRole}`}>
                        <Users className="h-3 w-3" /> {form.sharedRole}
                      </span>
                    )}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-foreground/90">{count}</span>
                </div>
                <h3 className="font-medium text-sm text-foreground leading-snug line-clamp-2">{form.title}</h3>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-foreground/35">
                    {new Date(form.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {count} {count !== 1 ? 'responses' : 'response'}
                  </p>
                  <span className="text-accent-amber text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Open →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

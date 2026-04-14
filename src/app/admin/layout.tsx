import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  // Check if they have API keys set up
  const { data: keysData } = await supabase
    .from('user_keys')
    .select('gemini_key, groq_key')
    .eq('user_id', user.id)
    .single()

  const hasKeys = keysData?.gemini_key && keysData?.groq_key

  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav */}
      <nav className="border-b border-foreground/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="font-serif text-xl font-bold tracking-tight text-accent-amber">
            Voca
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-foreground/60">
            <Link href="/admin" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link href="/admin/settings" className="hover:text-foreground transition-colors">Settings</Link>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-foreground/60">{user.email}</span>
          <form action="/auth/signout" method="POST">
            <button className="text-foreground/80 hover:text-foreground transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      
      {children}
    </div>
  )
}

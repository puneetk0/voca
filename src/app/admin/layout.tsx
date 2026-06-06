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

  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav */}
      <nav className="border-b border-foreground/[0.07] px-6 py-3.5 flex items-center justify-between backdrop-blur-sm sticky top-0 z-20 bg-background/95">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="text-base font-semibold tracking-tight text-accent-amber">
            Voca
          </Link>
          <div className="hidden sm:flex items-center gap-1 text-sm">
            <Link href="/admin" className="px-3 py-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors font-medium">Dashboard</Link>
            <Link href="/admin/settings" className="px-3 py-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors font-medium">Settings</Link>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-foreground/40 hidden sm:block">{user.email}</span>
          <form action="/auth/signout" method="POST">
            <button className="px-3 py-1.5 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {children}
    </div>
  )
}

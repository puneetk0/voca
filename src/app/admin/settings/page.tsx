import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Key } from 'lucide-react'
import SettingsForm from './_components/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: keys } = await supabase
    .from('user_keys')
    .select('groq_key')
    .eq('user_id', user.id)
    .single()

  const hasPlatformKeys = !!(process.env.GROQ_KEY || process.env.GROQ_KEY_2 || process.env.CEREBRAS_API_KEY)

  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      <div className="mb-10">
        <h1 className="text-3xl font-medium text-foreground tracking-tight flex items-center gap-3">
          <Key className="h-6 w-6 text-foreground/50" /> API Keys
        </h1>
        <p className="mt-2 text-foreground/60">Optional — add your own keys to use your personal API quota.</p>
      </div>

      <SettingsForm
        initialGroq={keys?.groq_key || ''}
        hasPlatformKeys={hasPlatformKeys}
      />
    </main>
  )
}

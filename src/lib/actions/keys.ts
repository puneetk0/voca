'use server'

import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function saveUserKeys(geminiKey: string, groqKey: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Resilience: ensure the user exists in public.users (in case they signed up before schema trigger was applied)
    const { data: publicUser } = await supabaseAdmin.from('users').select('id').eq('id', user.id).single()
    if (!publicUser) {
      await supabaseAdmin.from('users').insert({ id: user.id, email: user.email })
    }

    const { error } = await supabase
      .from('user_keys')
      .upsert({ 
        user_id: user.id, 
        gemini_key: geminiKey, 
        groq_key: groqKey 
      })

    if (error) {
      console.error('Supabase error saving keys:', error)
      throw new Error(error.message || 'Database error')
    }

    return { success: true }
  } catch (err: any) {
    console.error('Action error saving keys:', err)
    return { error: err.message || 'Server error' }
  }
}

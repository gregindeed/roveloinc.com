'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')

  if (password.length < 8)
    redirect(`/set-password?error=${encodeURIComponent('Password must be at least 8 characters.')}`)
  if (password !== confirm)
    redirect(`/set-password?error=${encodeURIComponent('Passwords do not match.')}`)

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    redirect(`/login?error=${encodeURIComponent('Your setup link expired. Please ask for a new one.')}`)

  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect(`/set-password?error=${encodeURIComponent(error.message)}`)

  // Send them where they belong, so a new manager/collaborator doesn't dead-end
  // on the portal's "no client linked" screen.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? null
  redirect(role === 'admin' || role === 'collaborator' ? '/admin' : '/portal')
}

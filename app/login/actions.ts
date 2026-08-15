'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isLocale } from '@/lib/i18n'

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const next = String(formData.get('next') || '')

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const params = new URLSearchParams({ error: 'Invalid email or password.' })
    if (next) params.set('next', next)
    redirect(`/login?${params.toString()}`)
  }

  // Decide where to send them based on their role.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let role: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, locale')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
    // Seed the language cookie from their saved preference so the UI opens in
    // their language immediately.
    if (isLocale(profile?.locale)) {
      cookies().set('locale', profile.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
    }
  }

  revalidatePath('/', 'layout')

  // Only same-origin paths — reject protocol-relative (//evil.com) open redirects.
  if (next && next.startsWith('/') && !next.startsWith('//')) redirect(next)
  // Owners, managers, and collaborators work on the admin side; clients see the portal.
  redirect(role === 'admin' || role === 'collaborator' ? '/admin' : '/portal')
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { provisionPortalLogin, portalLoginFor, sendPortalLoginLink } from '@/lib/portal'

function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3001'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

// Managers/owner only (not collaborators).
async function requireManager() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/admin')
  return supabase
}

// Invite (or re-invite) the client to their portal after onboarding.
export async function invitePortalClient(slug: string, formData: FormData) {
  const supabase = await requireManager()
  const email = String(formData.get('email') || '').trim()
  if (!email) redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent('Enter an email to send a portal invite.')}`)

  const { data: client } = await supabase.from('clients').select('id, name').eq('slug', slug).single()
  if (!client) redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent('Entity not found.')}`)

  const res = await provisionPortalLogin(client.id as string, client.name as string, email, siteUrl())
  revalidatePath(`/admin/clients/${slug}/account`)
  if (!res.ok) {
    redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent(res.error)}`)
  }
  redirect(`/admin/clients/${slug}/account?ok=${encodeURIComponent(`Portal invite emailed to ${email}.`)}`)
}

// Email the existing portal client a fresh way in. `kind` is 'magiclink'
// (one-click sign-in, no password) or 'recovery' (set a new password).
async function sendPortalLink(slug: string, kind: 'magiclink' | 'recovery') {
  const supabase = await requireManager()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent('Entity not found.')}`)

  const login = await portalLoginFor(client.id as string)
  if (!login) {
    redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent('No active portal login yet — send an invite first.')}`)
  }

  const res = await sendPortalLoginLink(login.email, kind, siteUrl())
  revalidatePath(`/admin/clients/${slug}/account`)
  if (!res.ok) {
    redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent(res.error)}`)
  }
  const what = kind === 'magiclink' ? 'Sign-in link' : 'Password-reset link'
  redirect(`/admin/clients/${slug}/account?ok=${encodeURIComponent(`${what} emailed to ${login.email}.`)}`)
}

// Bound in the panel: <form action={sendPortalMagicLink.bind(null, slug)}>
export async function sendPortalMagicLink(slug: string) {
  await sendPortalLink(slug, 'magiclink')
}

export async function sendPortalPasswordReset(slug: string) {
  await sendPortalLink(slug, 'recovery')
}

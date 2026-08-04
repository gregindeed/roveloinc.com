'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, inviteEmailHtml } from '@/lib/email'

/** Base URL of the current deployment, derived from the request. */
function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3001'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

/** Verify the caller is a signed-in admin. Redirects away if not. */
async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/portal')
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fail(message: string): never {
  redirect(`/admin/new?error=${encodeURIComponent(message)}`)
}

export async function createClientAccount(formData: FormData) {
  await requireAdmin()

  const name = String(formData.get('name') || '').trim()
  const slug = slugify(String(formData.get('slug') || '') || name)
  const owner = String(formData.get('owner') || '').trim() || null
  const address = String(formData.get('address') || '').trim() || null
  const email = String(formData.get('email') || '').trim()

  if (!name) fail('Business name is required.')
  if (!slug) fail('A URL slug is required.')
  if (!email) fail('A login email is required.')

  const base = siteUrl()
  const admin = createAdminClient()

  // 1) Create the tenant.
  const { data: client, error: cErr } = await admin
    .from('clients')
    .insert({ name, slug, owner_name: owner, address })
    .select('id, slug, name')
    .single()
  if (cErr) {
    if (cErr.code === '23505') fail(`The slug "${slug}" is already in use. Pick another.`)
    fail(`Could not create client: ${cErr.message}`)
  }

  // 2) Create the login as an invited user (no password yet) and get a
  //    single-use link the client will use to set their own password.
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (lErr || !link?.user) {
    await admin.from('clients').delete().eq('id', client!.id) // roll back tenant
    fail(`Could not create login: ${lErr?.message ?? 'unknown error'}`)
  }

  // 3) Link the auto-created profile to this client, as a read-only client role.
  const { error: pErr } = await admin
    .from('profiles')
    .update({ role: 'client', client_id: client!.id })
    .eq('id', link!.user.id)
  if (pErr) fail(`Login created, but linking failed: ${pErr.message}`)

  // 4) Email the client a secure set-password link (routed through our app).
  const tokenHash = link!.properties?.hashed_token
  const setupUrl = `${base}/auth/confirm?token_hash=${tokenHash}&type=invite&next=/set-password`
  try {
    await sendEmail({
      to: email,
      subject: 'Your Rovelo Inc client portal',
      html: inviteEmailHtml(client!.name, setupUrl),
    })
  } catch (e) {
    revalidatePath('/admin')
    const msg = e instanceof Error ? e.message : 'unknown error'
    redirect(`/admin/clients/${client!.slug}?warn=${encodeURIComponent(`Client created, but the invite email failed: ${msg}`)}`)
  }

  revalidatePath('/admin')
  redirect(`/admin/clients/${client!.slug}?ok=${encodeURIComponent(`Client created and an invite was emailed to ${email}.`)}`)
}

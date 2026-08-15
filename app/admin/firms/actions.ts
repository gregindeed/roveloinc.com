'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, teamInviteEmailHtml } from '@/lib/email'
import { requirePlatform } from '@/lib/auth'

function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

const back = (key: 'ok' | 'error', msg: string): never =>
  redirect(`/admin/firms?${key}=${encodeURIComponent(msg)}`)

const failNew = (msg: string): never => redirect(`/admin/firms/new?error=${encodeURIComponent(msg)}`)

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

type Admin = ReturnType<typeof createAdminClient>

// Add an accountant-manager to a firm (no redirects — callers handle messaging).
// Existing users just get a membership (one person can span firms); new people
// are invited by email.
async function addManager(
  admin: Admin,
  base: string,
  orgId: string,
  email: string
): Promise<{ ok: true; existed: boolean } | { ok: false; error: string }> {
  const { data: list } = await admin.auth.admin.listUsers()
  const existing = (list?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email)
  if (existing) {
    const { error } = await admin
      .from('memberships')
      .upsert({ user_id: existing.id, org_id: orgId, role: 'admin' }, { onConflict: 'user_id,org_id' })
    if (error) return { ok: false, error: `Could not add them to the firm: ${error.message}` }
    return { ok: true, existed: true }
  }

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  const invited = link?.user
  if (lErr || !invited) return { ok: false, error: `Could not create the invite: ${lErr?.message ?? 'unknown error'}` }

  await admin.from('profiles').update({ role: 'admin', is_owner: false, org_id: orgId, client_id: null }).eq('id', invited.id)
  const { error: mErr } = await admin
    .from('memberships')
    .upsert({ user_id: invited.id, org_id: orgId, role: 'admin' }, { onConflict: 'user_id,org_id' })
  if (mErr) return { ok: false, error: `Invite created, but assigning the firm failed: ${mErr.message}` }

  const setupUrl = `${base}/auth/confirm?token_hash=${link!.properties?.hashed_token}&type=invite&next=/set-password`
  try {
    await sendEmail({
      to: email,
      subject: 'You’ve been added to a firm on Rovelo Inc',
      html: teamInviteEmailHtml('Accountant / Manager', 'You can manage your firm’s clients and their books.', setupUrl),
    })
  } catch (e) {
    return { ok: false, error: `Manager added, but the invite email failed: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
  return { ok: true, existed: false }
}

// One deliberate onboarding step: stand up the partner firm AND invite its first
// accountant-manager together, so a firm launches as a real, staffed partnership.
export async function onboardFirm(formData: FormData) {
  await requirePlatform()
  const name = String(formData.get('name') || '').trim()
  const notes = String(formData.get('notes') || '').trim() || null
  const email = String(formData.get('manager_email') || '').trim().toLowerCase()
  if (!name) failNew('A firm name is required.')

  const admin = createAdminClient()
  const { data: org, error } = await admin
    .from('organizations')
    .insert({ name, slug: slugify(name), is_platform: false, notes })
    .select('id')
    .single()
  if (error || !org) {
    if (error?.code === '23505') failNew('A firm with a similar name already exists.')
    failNew(`Could not create the firm: ${error?.message ?? 'unknown error'}`)
  }

  revalidatePath('/admin/firms')

  // Optionally invite the first manager as part of onboarding.
  if (email) {
    const r = await addManager(admin, siteUrl(), org!.id as string, email)
    if (!r.ok) back('error', `${name} was created, but ${r.error}`)
    else
      back(
        'ok',
        r.existed
          ? `${name} is now a partner firm — ${email} already had an account and is set as their first manager.`
          : `${name} is now a partner firm on Rovelo. We invited ${email} as their first accountant-manager.`
      )
  }

  back('ok', `${name} is now a partner firm. Invite their accountant-managers from the directory.`)
}

// Re-send a firm manager a fresh access link when they can't get in — a new
// invite if they never signed in, a password-reset link if they have an account
// but are locked out. Both land on the branded confirm page → set-password.
const backToFirm = (orgId: string, key: 'ok' | 'error', msg: string): never =>
  redirect(`/admin/firms/${orgId}?${key}=${encodeURIComponent(msg)}`)

export async function resetManagerAccess(orgId: string, formData: FormData) {
  await requirePlatform()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email || !email.includes('@')) backToFirm(orgId, 'error', 'A valid email is required.')

  const base = siteUrl()
  const admin = createAdminClient()
  const { data: list } = await admin.auth.admin.listUsers()
  const user = (list?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email)
  if (!user) backToFirm(orgId, 'error', `No account found for ${email}. Invite them as a manager first.`)

  // Never signed in → re-invite; otherwise a recovery (password reset) link.
  const type: 'invite' | 'recovery' = user!.last_sign_in_at ? 'recovery' : 'invite'
  const { data: link, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (error || !link?.properties?.hashed_token) {
    backToFirm(orgId, 'error', `Could not create a link: ${error?.message ?? 'unknown error'}`)
  }

  const setupUrl = `${base}/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=${type}&next=/set-password`
  try {
    await sendEmail({
      to: email,
      subject: 'Your Rovelo Inc sign-in link',
      html: teamInviteEmailHtml(
        'Reset your access',
        'Use the link below to set a new password and sign in to Rovelo Inc. It replaces any earlier link.',
        setupUrl
      ),
    })
  } catch (e) {
    backToFirm(orgId, 'error', `Could not send the email: ${e instanceof Error ? e.message : 'unknown error'}`)
  }
  backToFirm(
    orgId,
    'ok',
    `Sent a fresh ${type === 'recovery' ? 'password-reset' : 'invite'} link to ${email}.`
  )
}

// Add another manager to an existing firm (from the directory).
export async function inviteFirmManager(orgId: string, formData: FormData) {
  await requirePlatform()
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) back('error', 'An email is required.')

  const r = await addManager(createAdminClient(), siteUrl(), orgId, email)
  revalidatePath('/admin/firms')
  if (!r.ok) back('error', r.error)
  else back('ok', r.existed ? `${email} already had an account and was added to this firm as a manager.` : `Invite sent to ${email}.`)
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, teamInviteEmailHtml, accessGrantedEmailHtml } from '@/lib/email'
import { requireOwner } from '@/lib/auth'

type Admin = ReturnType<typeof createAdminClient>

function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/account?${key}=${encodeURIComponent(msg)}`)

// Show m•••@outlook.com — enough to recognize, not the full address.
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const head = local.slice(0, 1)
  return `${head}${'•'.repeat(Math.max(1, Math.min(local.length - 1, 3)))}@${domain}`
}

// auth.users has the emails; profiles does not. Build an id→email map once.
async function emailMap(admin: Admin): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    for (const u of users) if (u.email) map.set(u.id, u.email)
    if (error || users.length < 200) break
    page++
    if (page > 25) break // safety cap (~5k users)
  }
  return map
}

async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const map = await emailMap(admin)
  for (const [id, e] of map) if (e.toLowerCase() === email) return id
  return null
}

// Grant an EXISTING user access to one entity — never touches their profile,
// role, firm, or memberships. Then notify them and return to the settings page.
async function grantAccessAndNotify(
  admin: Admin,
  slug: string,
  client: { id: string; name: string },
  userId: string,
  email: string
): Promise<void> {
  const { error } = await admin
    .from('entity_access')
    .upsert({ user_id: userId, client_id: client.id }, { onConflict: 'user_id,client_id' })
  if (error) back(slug, 'warn', `Could not grant access: ${error.message}`)

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `You've been given access to ${client.name}`,
        html: accessGrantedEmailHtml(client.name, `${siteUrl()}/admin/clients/${slug}`),
      })
    } catch {
      // Access is granted regardless; the email is best-effort.
    }
  }
  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', `${email || 'They'} now ${email ? 'has' : 'have'} access to ${client.name}.`)
}

// Add a collaborator to THIS entity.
//  • existing account (any firm) → just grant access, leave their identity alone
//  • brand-new email             → create the account + invite to set a password
export async function inviteCollaborator(slug: string, formData: FormData) {
  await requireOwner()
  const admin = createAdminClient()

  const { data: client } = await admin.from('clients').select('id, name').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) back(slug, 'warn', 'An email is required.')

  // Already onboarded? Grant to this entity only, without disturbing their account.
  const existingId = await findUserIdByEmail(admin, email)
  if (existingId) {
    return grantAccessAndNotify(admin, slug, client as { id: string; name: string }, existingId, email)
  }

  // New person: create the account and send a set-your-password invite.
  const base = siteUrl()
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (lErr || !link?.user) {
    back(slug, 'warn', `Could not invite: ${lErr?.message || 'unknown error'}`)
  }

  const uid = link!.user!.id
  await admin.from('profiles').update({ role: 'collaborator', is_owner: false, client_id: null }).eq('id', uid)
  const { error: gErr } = await admin
    .from('entity_access')
    .upsert({ user_id: uid, client_id: client!.id }, { onConflict: 'user_id,client_id' })
  if (gErr) back(slug, 'warn', `Role set, but granting access failed: ${gErr.message}`)

  const tokenHash = link!.properties?.hashed_token
  const setupUrl = `${base}/auth/confirm?token_hash=${tokenHash}&type=invite&next=/set-password`
  try {
    await sendEmail({
      to: email,
      subject: 'You’ve been added to Rovelo Inc',
      html: teamInviteEmailHtml('Collaborator', `You have access to ${client!.name}.`, setupUrl),
    })
  } catch (e) {
    back(slug, 'warn', `Added, but the invite email failed: ${e instanceof Error ? e.message : 'unknown error'}`)
  }

  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', `Collaborator invite sent to ${email}.`)
}

// Grant an already-onboarded user (picked from search) access to this entity.
export async function grantExistingCollaborator(slug: string, userId: string) {
  await requireOwner()
  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id, name').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  const { data: u } = await admin.auth.admin.getUserById(userId)
  const email = u?.user?.email ?? ''
  return grantAccessAndNotify(admin, slug, client as { id: string; name: string }, userId, email)
}

// Type-ahead search for people to add as collaborators.
//  • platform admins (Rovelo) can find anyone onboarded
//  • other firm owners are scoped to their own firm's members + existing collaborators
// Returns a light, display-only shape (id + name + masked email + firm).
export async function searchAddableUsers(
  slug: string,
  query: string
): Promise<{ id: string; name: string; handle: string | null; avatar: string | null; email: string; firm: string }[]> {
  const viewer = await requireOwner()
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const admin = createAdminClient()

  // Candidate profiles, scoped by who's asking.
  type Prof = { id: string; display_name: string | null; handle: string | null; avatar_url: string | null; org_id: string | null; role: string }
  let profs: Prof[] = []
  if (viewer.isPlatform) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, org_id, role')
      .in('role', ['admin', 'collaborator'])
    profs = (data ?? []) as Prof[]
  } else {
    const orgIds = viewer.firms.filter((f) => f.role === 'admin').map((f) => f.orgId)
    if (orgIds.length === 0) return []
    const [{ data: mems }, { data: myClients }] = await Promise.all([
      admin.from('memberships').select('user_id').in('org_id', orgIds),
      admin.from('clients').select('id').in('org_id', orgIds),
    ])
    const clientIds = (myClients ?? []).map((c) => c.id as string)
    let grantIds: string[] = []
    if (clientIds.length) {
      const { data: grants } = await admin.from('entity_access').select('user_id').in('client_id', clientIds)
      grantIds = (grants ?? []).map((g) => g.user_id as string)
    }
    const ids = Array.from(new Set([...(mems ?? []).map((m) => m.user_id as string), ...grantIds]))
    if (ids.length === 0) return []
    const { data } = await admin.from('profiles').select('id, display_name, handle, avatar_url, org_id, role').in('id', ids)
    profs = (data ?? []) as Prof[]
  }

  // Supporting lookups: emails, firm names, and who's already on this client.
  const [emails, { data: orgs }, { data: client }] = await Promise.all([
    emailMap(admin),
    admin.from('organizations').select('id, name'),
    admin.from('clients').select('id').eq('slug', slug).single(),
  ])
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))
  const granted = new Set<string>()
  if (client?.id) {
    const { data: g } = await admin.from('entity_access').select('user_id').eq('client_id', client.id)
    for (const r of g ?? []) granted.add(r.user_id as string)
  }

  const out: { id: string; name: string; handle: string | null; avatar: string | null; email: string; firm: string }[] = []
  for (const p of profs) {
    if (p.id === viewer.userId || granted.has(p.id)) continue
    const email = emails.get(p.id) ?? ''
    const name = p.display_name || email || '(no name)'
    const handle = p.handle ?? null
    if (
      !name.toLowerCase().includes(q) &&
      !email.toLowerCase().includes(q) &&
      !(handle && handle.toLowerCase().includes(q))
    )
      continue
    out.push({
      id: p.id,
      name,
      handle,
      avatar: p.avatar_url ?? null,
      email: email ? maskEmail(email) : '',
      firm: (p.org_id && orgName.get(p.org_id)) || '',
    })
    if (out.length >= 8) break
  }
  return out
}

// Re-send a collaborator their access email. If they never set a password we
// send a fresh set-password invite; if they already have a login we re-send the
// "you have access" notice with a link into the entity.
export async function resendCollaboratorInvite(slug: string, userId: string) {
  await requireOwner()
  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id, name').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  const { data: u } = await admin.auth.admin.getUserById(userId)
  const email = u?.user?.email ?? ''
  if (!email) back(slug, 'warn', 'No email on file for this collaborator.')

  const base = siteUrl()
  const neverSignedIn = !u?.user?.last_sign_in_at

  try {
    if (neverSignedIn) {
      const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${base}/auth/confirm` },
      })
      if (error || !link?.properties?.hashed_token) {
        back(slug, 'warn', `Could not create a link: ${error?.message ?? 'unknown error'}`)
      }
      const setupUrl = `${base}/auth/confirm?token_hash=${link!.properties!.hashed_token}&type=invite&next=/set-password`
      await sendEmail({
        to: email,
        subject: 'You’ve been added to Rovelo Inc',
        html: teamInviteEmailHtml('Collaborator', `You have access to ${client!.name}.`, setupUrl),
      })
    } else {
      await sendEmail({
        to: email,
        subject: `You've been given access to ${client!.name}`,
        html: accessGrantedEmailHtml(client!.name, `${base}/admin/clients/${slug}`),
      })
    }
  } catch (e) {
    back(slug, 'warn', `Could not send the email: ${e instanceof Error ? e.message : 'unknown error'}`)
  }

  back(slug, 'ok', `Invite re-sent to ${email}.`)
}

// Remove a collaborator's access to THIS entity (their other grants are untouched).
export async function revokeEntityAccess(slug: string, userId: string) {
  await requireOwner()
  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  await admin.from('entity_access').delete().eq('user_id', userId).eq('client_id', client!.id)
  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', 'Access removed.')
}

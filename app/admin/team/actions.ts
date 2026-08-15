'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, teamInviteEmailHtml } from '@/lib/email'
import { requireOwner } from '@/lib/auth'

function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

const back = (key: 'ok' | 'error', msg: string): never =>
  redirect(`/admin/team?${key}=${encodeURIComponent(msg)}`)

export async function inviteTeamMember(formData: FormData) {
  const v = await requireOwner()
  const orgId = v.orgId

  const email = String(formData.get('email') || '').trim().toLowerCase()
  const type = String(formData.get('type') || 'collaborator')
  const role = type === 'manager' ? 'admin' : 'collaborator'
  const entityIds = role === 'collaborator' ? formData.getAll('entity_ids').map(String) : []

  if (!email) back('error', 'An email is required.')
  if (role === 'admin' && !orgId) {
    back('error', 'Your account has no firm assigned, so a manager cannot be added. Contact Rovelo.')
  }
  if (role === 'collaborator' && entityIds.length === 0) {
    back('error', 'Pick at least one entity for a collaborator.')
  }

  const admin = createAdminClient()
  const base = siteUrl()

  // Grant the work-side access for a given user id (existing or freshly invited).
  const grantAccess = async (uid: string): Promise<string | null> => {
    if (role === 'admin') {
      // Manager: profile role + a membership row in this firm. Clear any
      // collaborator grants they held here (they now see the whole firm).
      const { error: pErr } = await admin
        .from('profiles')
        .update({ role: 'admin', is_owner: false, org_id: orgId, client_id: null })
        .eq('id', uid)
      if (pErr) return `assigning the role failed: ${pErr.message}`
      const { error: mErr } = await admin
        .from('memberships')
        .upsert({ user_id: uid, org_id: orgId, role: 'admin' }, { onConflict: 'user_id,org_id' })
      if (mErr) return `assigning the firm failed: ${mErr.message}`
      return null
    }
    // Collaborator: profile role + per-entity grants (idempotent).
    const { error: pErr } = await admin
      .from('profiles')
      .update({ role: 'collaborator', is_owner: false, client_id: null })
      .eq('id', uid)
    if (pErr) return `assigning the role failed: ${pErr.message}`
    const rows = entityIds.map((cid) => ({ user_id: uid, client_id: cid }))
    const { error: gErr } = await admin
      .from('entity_access')
      .upsert(rows, { onConflict: 'user_id,client_id' })
    if (gErr) return `granting entity access failed: ${gErr.message}`
    return null
  }

  // Already a user (e.g. a collaborator elsewhere)? Grant access, no new invite.
  const { data: userList } = await admin.auth.admin.listUsers()
  const existing = (userList?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email)
  if (existing) {
    const err = await grantAccess(existing.id)
    if (err) back('error', `Could not add them: ${err}`)
    revalidatePath('/admin/team')
    back('ok', `${email} already had an account and was added${role === 'admin' ? ' as a manager' : ''}.`)
  }

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  const invited = link?.user
  if (lErr || !invited) back('error', `Could not create the invite: ${lErr?.message ?? 'unknown error'}`)

  const gErr = await grantAccess(invited!.id)
  if (gErr) back('error', `Invite created, but ${gErr}`)

  const roleLabel = role === 'admin' ? 'Manager (all entities)' : 'Collaborator'
  const scopeLine =
    role === 'admin'
      ? 'You can manage every client in your firm.'
      : `You have access to ${entityIds.length} entit${entityIds.length === 1 ? 'y' : 'ies'} assigned to you.`
  const tokenHash = link!.properties?.hashed_token
  const setupUrl = `${base}/auth/confirm?token_hash=${tokenHash}&type=invite&next=/set-password`

  try {
    await sendEmail({ to: email, subject: 'You’ve been added to Rovelo Inc', html: teamInviteEmailHtml(roleLabel, scopeLine, setupUrl) })
  } catch (e) {
    back('error', `Member added, but the invite email failed: ${e instanceof Error ? e.message : 'unknown error'}`)
  }

  revalidatePath('/admin/team')
  back('ok', `Invite sent to ${email}.`)
}

export async function updateMemberAccess(userId: string, formData: FormData) {
  const v = await requireOwner()
  const orgId = v.orgId
  const admin = createAdminClient()

  const { data: target } = await admin.from('profiles').select('is_owner').eq('id', userId).single()
  if (!target) back('error', 'Member not found.')
  if (target!.is_owner) back('error', 'The owner account cannot be changed here.')

  const type = String(formData.get('type') || 'collaborator')
  const role = type === 'manager' ? 'admin' : 'collaborator'
  const entityIds = role === 'collaborator' ? formData.getAll('entity_ids').map(String) : []
  if (role === 'admin' && !orgId) {
    back('error', 'Your account has no firm assigned, so a manager cannot be added. Contact Rovelo.')
  }
  if (role === 'collaborator' && entityIds.length === 0) back('error', 'Pick at least one entity for a collaborator.')

  if (role === 'admin') {
    // Promote to firm manager: set role + org, add membership, drop per-entity grants.
    await admin.from('profiles').update({ role: 'admin', is_owner: false, org_id: orgId, client_id: null }).eq('id', userId)
    await admin.from('memberships').upsert({ user_id: userId, org_id: orgId, role: 'admin' }, { onConflict: 'user_id,org_id' })
    await admin.from('entity_access').delete().eq('user_id', userId)
  } else {
    // Collaborator: set role, remove this firm's manager membership, reset grants.
    await admin.from('profiles').update({ role: 'collaborator', is_owner: false, client_id: null }).eq('id', userId)
    if (orgId) await admin.from('memberships').delete().eq('user_id', userId).eq('org_id', orgId)
    await admin.from('entity_access').delete().eq('user_id', userId)
    await admin.from('entity_access').insert(entityIds.map((cid) => ({ user_id: userId, client_id: cid })))
  }

  revalidatePath('/admin/team')
  back('ok', 'Access updated.')
}

export async function removeMember(userId: string) {
  await requireOwner()
  const admin = createAdminClient()

  const { data: target } = await admin.from('profiles').select('is_owner, role').eq('id', userId).single()
  if (!target) back('error', 'Member not found.')
  if (target!.is_owner) back('error', 'You cannot remove the owner account.')

  // Deleting the auth user cascades to their profile and entity_access grants.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) back('error', `Could not remove member: ${error.message}`)

  revalidatePath('/admin/team')
  back('ok', 'Member removed.')
}

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

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/account?${key}=${encodeURIComponent(msg)}`)

// Invite a NEW external collaborator scoped to this one entity.
export async function inviteCollaborator(slug: string, formData: FormData) {
  await requireOwner()
  const admin = createAdminClient()

  const { data: client } = await admin.from('clients').select('id, name').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) back(slug, 'warn', 'An email is required.')

  const base = siteUrl()
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (lErr || !link?.user) {
    const msg = lErr?.message ?? ''
    if (/already/i.test(msg)) {
      back(slug, 'warn', 'That email already has an account — manage them from Settings → Team.')
    }
    back(slug, 'warn', `Could not invite: ${msg || 'unknown error'}`)
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

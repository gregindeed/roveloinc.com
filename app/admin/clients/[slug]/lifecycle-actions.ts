'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requirePlatform } from '@/lib/auth'
import { logEvent } from '@/lib/registryServer'

const BUCKET = 'client-docs'

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/account?${key}=${encodeURIComponent(msg)}`)

async function loadClient(slug: string) {
  const supabase = createClient()
  const { data } = await supabase.from('clients').select('id, name, org_id').eq('slug', slug).single()
  return { supabase, client: data as { id: string; name: string; org_id: string | null } | null }
}

// ── Archive / unarchive (engagement) — firm managers + platform ──────────────
export async function archiveClient(slug: string) {
  const v = await requireAdmin()
  const { supabase } = await loadClient(slug)
  const { data, error } = await supabase
    .from('clients')
    .update({ archived_at: new Date().toISOString() })
    .eq('slug', slug)
    .select('id')
  if (error) back(slug, 'warn', error.message)
  if (!data || data.length === 0) back(slug, 'warn', 'You don’t have permission to archive this entity.')
  await logEvent(supabase, data![0].id as string, {
    kind: 'lifecycle',
    source: 'operator',
    actor: v.email ?? 'Operator',
    title: 'Archived — engagement paused',
    createdBy: v.userId,
  })
  revalidatePath('/admin')
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', 'Client archived. Their books are kept; their portal now shows an archived notice.')
}

export async function unarchiveClient(slug: string) {
  const v = await requireAdmin()
  const { supabase } = await loadClient(slug)
  const { data, error } = await supabase.from('clients').update({ archived_at: null }).eq('slug', slug).select('id')
  if (error) back(slug, 'warn', error.message)
  if (!data || data.length === 0) back(slug, 'warn', 'You don’t have permission to restore this entity.')
  await logEvent(supabase, data![0].id as string, {
    kind: 'lifecycle',
    source: 'operator',
    actor: v.email ?? 'Operator',
    title: 'Restored to active engagement',
    createdBy: v.userId,
  })
  revalidatePath('/admin')
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', 'Client restored to active.')
}

// ── Dissolve / reactivate (real-world entity state) — managers + platform ────
export async function dissolveClient(slug: string, formData: FormData) {
  const v = await requireAdmin()
  const { supabase } = await loadClient(slug)
  const raw = String(formData.get('dissolved_date') ?? '').trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('clients')
    .update({ dissolved_date: date, status: 'dissolved' })
    .eq('slug', slug)
    .select('id')
  if (error) back(slug, 'warn', error.message)
  if (!data || data.length === 0) back(slug, 'warn', 'You don’t have permission to change this entity.')
  await logEvent(supabase, data![0].id as string, {
    kind: 'lifecycle',
    source: 'operator',
    actor: v.email ?? 'Operator',
    title: `Marked dissolved as of ${date}`,
    detail: 'The business no longer legally exists; books kept as a historical record.',
    pinned: true,
    createdBy: v.userId,
  })
  revalidatePath('/admin')
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', `Marked dissolved as of ${date}. The books stay as a historical record.`)
}

export async function reactivateClient(slug: string) {
  const v = await requireAdmin()
  const { supabase } = await loadClient(slug)
  const { data, error } = await supabase
    .from('clients')
    .update({ dissolved_date: null, status: 'active' })
    .eq('slug', slug)
    .select('id')
  if (error) back(slug, 'warn', error.message)
  if (!data || data.length === 0) back(slug, 'warn', 'You don’t have permission to change this entity.')
  await logEvent(supabase, data![0].id as string, {
    kind: 'lifecycle',
    source: 'operator',
    actor: v.email ?? 'Operator',
    title: 'Marked operating again',
    createdBy: v.userId,
  })
  revalidatePath('/admin')
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', 'Entity marked operating again.')
}

// ── Transfer between firms — platform only ───────────────────────────────────
export async function transferClient(slug: string, formData: FormData) {
  const v = await requirePlatform()
  const { supabase, client } = await loadClient(slug)
  if (!client) back(slug, 'warn', 'Entity not found.')
  const targetOrg = String(formData.get('org_id') ?? '').trim()
  if (!targetOrg) back(slug, 'warn', 'Pick a firm to transfer to.')

  const admin = createAdminClient()
  const { data: org } = await admin.from('organizations').select('id, name').eq('id', targetOrg).maybeSingle()
  if (!org) back(slug, 'warn', 'That firm no longer exists.')
  if (client!.org_id === targetOrg) back(slug, 'warn', `Already assigned to ${org!.name}.`)

  const { data, error } = await supabase.from('clients').update({ org_id: targetOrg }).eq('slug', slug).select('id')
  if (error) back(slug, 'warn', error.message)
  if (!data || data.length === 0) back(slug, 'warn', 'Transfer was not permitted.')
  await logEvent(supabase, client!.id, {
    kind: 'lifecycle',
    source: 'operator',
    actor: v.email ?? 'Operator',
    title: `Transferred to ${org!.name}`,
    createdBy: v.userId,
  })
  revalidatePath('/admin')
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', `Transferred to ${org!.name}.`)
}

// ── Permanent delete — platform only, type-name-to-confirm ───────────────────
export async function deleteClient(slug: string, formData: FormData) {
  await requirePlatform()
  const { client } = await loadClient(slug)
  if (!client) back(slug, 'warn', 'Entity not found.')

  const confirm = String(formData.get('confirm_name') ?? '').trim()
  if (confirm !== client!.name) {
    back(slug, 'warn', 'The name you typed didn’t match. Nothing was deleted.')
  }

  // Service role: purge storage (not FK-cascaded) then the row (cascades the
  // rest — deposits, expenses, documents, statements, grants, memberships refs).
  const admin = createAdminClient()
  const { data: files } = await admin.storage.from(BUCKET).list(client!.id, { limit: 1000 })
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((f) => `${client!.id}/${f.name}`))
  }
  const { error } = await admin.from('clients').delete().eq('id', client!.id)
  if (error) back(slug, 'warn', `Could not delete: ${error.message}`)

  revalidatePath('/admin')
  redirect(`/admin?ok=${encodeURIComponent(`"${client!.name}" was permanently deleted.`)}`)
}

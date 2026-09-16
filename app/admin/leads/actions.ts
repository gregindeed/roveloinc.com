'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWorker, requireAdmin } from '@/lib/auth'
import { normalizeLeadKind, normalizeLeadStage, type LeadStage } from '@/lib/leads'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

// One mapped row from a bulk import — all fields are already strings.
export type ImportRow = {
  name?: string
  kind?: string
  contact_name?: string
  email?: string
  phone?: string
  tax_id?: string
  address?: string
  notes?: string
  source?: string
}

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

// Bulk-create leads or accounts from imported rows. Called directly from the
// import wizard (client) with the already-mapped rows. Leads may be created by
// any worker; accounts (real clients) require a manager. Rows without a name are
// skipped. Returns counts so the wizard can report the result.
export async function bulkImport(
  destination: 'leads' | 'accounts',
  rows: ImportRow[]
): Promise<{ created: number; skipped: number; error?: string }> {
  const viewer = destination === 'accounts' ? await requireAdmin() : await requireWorker()
  const admin = createAdminClient()

  const valid = (rows ?? []).filter((r) => clean(r.name))
  const skipped = (rows ?? []).length - valid.length
  if (valid.length === 0) return { created: 0, skipped, error: 'No rows had a name to import.' }
  // Guardrail against a runaway paste.
  if (valid.length > 5000) return { created: 0, skipped, error: 'That is over 5,000 rows — split the file into smaller batches.' }

  if (destination === 'leads') {
    const payload = valid.map((r) => ({
      org_id: viewer.orgId ?? null,
      kind: normalizeLeadKind(r.kind),
      name: clean(r.name)!,
      contact_name: clean(r.contact_name),
      email: clean(r.email),
      phone: clean(r.phone),
      tax_id: clean(r.tax_id),
      address: clean(r.address),
      stage: 'new',
      source: clean(r.source) ?? 'import',
      notes: clean(r.notes),
      created_by: viewer.userId,
    }))
    const { data, error } = await admin.from('leads').insert(payload).select('id')
    if (error) return { created: 0, skipped, error: error.message }
    revalidatePath('/admin')
    return { created: (data ?? []).length, skipped }
  }

  // Accounts: create a real client per row, with a unique slug (retry on clash).
  let created = 0
  for (const r of valid) {
    const name = clean(r.name)!
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account'
    let slug = base
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await admin.from('clients').insert({
        name,
        slug,
        org_id: viewer.orgId ?? null,
        kind: normalizeLeadKind(r.kind),
        owner_name: clean(r.contact_name),
        address: clean(r.address),
      })
      if (!error) {
        created++
        break
      }
      if ((error as { code?: string }).code === '23505') {
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
        continue
      }
      // A non-uniqueness error on one row shouldn't abort the whole batch.
      break
    }
  }
  revalidatePath('/admin')
  return { created, skipped }
}

const back = (key: 'ok' | 'error', msg: string): never =>
  redirect(`/admin?tab=leads&${key}=${encodeURIComponent(msg)}`)

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Create a lead (a prospective account). Any worker may add one.
export async function createLead(formData: FormData) {
  const viewer = await requireWorker()
  const name = str(formData, 'name')
  if (!name) back('error', 'A name is required.')

  // Honor an explicit firm (from a firm's ⋯ menu) only if the viewer belongs to
  // it or is a platform admin; otherwise fall back to the viewer's own firm.
  const wantedOrg = str(formData, 'org') || null
  const mayUseOrg = wantedOrg && (viewer.isPlatform || viewer.firms.some((f) => f.orgId === wantedOrg) || viewer.orgId === wantedOrg)
  const orgId = mayUseOrg ? wantedOrg : viewer.orgId ?? null

  const { error } = await createAdminClient()
    .from('leads')
    .insert({
      org_id: orgId,
      kind: normalizeLeadKind(formData.get('kind')),
      name,
      contact_name: str(formData, 'contact_name') || null,
      email: str(formData, 'email') || null,
      phone: str(formData, 'phone') || null,
      tax_id: str(formData, 'tax_id') || null,
      address: str(formData, 'address') || null,
      stage: normalizeLeadStage(formData.get('stage')),
      source: str(formData, 'source') || 'manual',
      notes: str(formData, 'notes') || null,
      created_by: viewer.userId,
    })
  revalidatePath('/admin')
  if (error) back('error', `Could not add the lead: ${error.message}`)
  back('ok', `Lead "${name}" added.`)
}

// Move a lead along the pipeline.
export async function setLeadStage(leadId: string, formData: FormData) {
  await requireWorker()
  const stage = normalizeLeadStage(formData.get('stage')) as LeadStage
  const { error } = await createAdminClient()
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  revalidatePath('/admin')
  if (error) back('error', `Could not update the lead: ${error.message}`)
  back('ok', 'Lead updated.')
}

export async function deleteLead(leadId: string) {
  await requireWorker()
  const { error } = await createAdminClient().from('leads').delete().eq('id', leadId)
  revalidatePath('/admin')
  if (error) back('error', `Could not remove the lead: ${error.message}`)
  back('ok', 'Lead removed.')
}

// Convert a won lead into a real client (account). Managers only. Mirrors the
// owner-quick-create insert (unique slug retry), then stamps the lead won and
// links the new client so it's never converted twice.
export async function convertLead(leadId: string) {
  const viewer = await requireAdmin()
  const admin = createAdminClient()

  const { data: row } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
  if (!row) back('error', 'Lead not found.')
  const lead = row as {
    name: string
    kind: string
    org_id: string | null
    contact_name: string | null
    address: string | null
    converted_client_id: string | null
  }
  if (lead.converted_client_id) back('error', 'This lead has already been converted to an account.')

  const baseSlug = slugify(lead.name) || 'account'
  let slug = baseSlug
  let created: { id: string; slug: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from('clients')
      .insert({
        name: lead.name,
        slug,
        org_id: lead.org_id ?? viewer.orgId ?? null,
        kind: normalizeLeadKind(lead.kind),
        owner_name: lead.contact_name,
        address: lead.address,
      })
      .select('id, slug')
      .single()
    if (!error && data) {
      created = data as { id: string; slug: string }
      break
    }
    if (error && (error as { code?: string }).code === '23505') {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    back('error', `Could not create the account: ${error?.message ?? 'unknown error'}`)
  }
  if (!created) back('error', 'Could not create the account — try a different name.')

  await admin
    .from('leads')
    .update({ stage: 'won', converted_client_id: created!.id, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  revalidatePath('/admin')
  redirect(`/admin/clients/${created!.slug}?ok=${encodeURIComponent(`Converted "${lead.name}" from a lead into an account.`)}`)
}

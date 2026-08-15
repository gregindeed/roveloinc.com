'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireWorker } from '@/lib/auth'
import { markVerified } from '@/lib/reviewServer'

const warn = (slug: string, msg: string): never =>
  redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent(msg)}`)

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : v
}
const int = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : parseInt(v, 10)
}
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : Number(v)
}

export async function updateEntity(slug: string, formData: FormData) {
  await requireAdmin() // managers/owner only — collaborators can't rewrite entity identity
  const supabase = createClient()

  const name = str(formData, 'name')
  if (!name) warn(slug, 'Business name is required.')

  const fields = {
    name,
    legal_name: str(formData, 'legal_name'),
    dba: str(formData, 'dba'),
    owner_name: str(formData, 'owner_name'),
    address: str(formData, 'address'),
    mailing_address: str(formData, 'mailing_address'),
    phone: str(formData, 'phone'),
    email: str(formData, 'email'),
    website: str(formData, 'website'),
    entity_type: str(formData, 'entity_type'),
    ein: str(formData, 'ein'),
    ca_sos_number: str(formData, 'ca_sos_number'),
    cdtfa_account: str(formData, 'cdtfa_account'),
    edd_account: str(formData, 'edd_account'),
    ftb_id: str(formData, 'ftb_id'),
    formation_date: str(formData, 'formation_date'),
    fiscal_year_end: str(formData, 'fiscal_year_end'),
    naics_code: str(formData, 'naics_code'),
    registered_agent: str(formData, 'registered_agent'),
    registered_agent_address: str(formData, 'registered_agent_address'),
    accounting_method: str(formData, 'accounting_method'),
    employee_count: int(formData, 'employee_count'),
    status: str(formData, 'status') ?? 'active',
    notes: str(formData, 'notes'),
  }

  const { data, error } = await supabase.from('clients').update(fields).eq('slug', slug).select('id')
  if (error) warn(slug, error.message)
  // 0 rows updated = RLS denied it (e.g. a manager of a different firm). Don't
  // pretend it saved.
  if (!data || data.length === 0) warn(slug, 'You don’t have permission to edit this entity, or it no longer exists.')

  // Operator-entered values are verified ground truth — protect them from being
  // overwritten by a later AI extraction, and clear any stale review for them.
  await markVerified(supabase, data![0].id as string, Object.keys(fields))

  revalidatePath(`/admin/clients/${slug}`)
  redirect(`/admin/clients/${slug}/account?ok=${encodeURIComponent('Entity profile updated.')}`)
}

const EDITABLE_FIELDS = new Set([
  'name', 'legal_name', 'dba', 'owner_name', 'address', 'mailing_address', 'phone', 'email', 'website',
  'entity_type', 'ein', 'ca_sos_number', 'cdtfa_account', 'edd_account', 'ftb_id', 'formation_date',
  'fiscal_year_end', 'naics_code', 'registered_agent', 'registered_agent_address', 'accounting_method',
  'employee_count', 'status', 'notes',
])

// Set the entity's income model — 'simple' (bank deposits are the record) or
// 'sales' (sales journal + tie-out). Reversible; only toggles which tabs show
// and how revenue is recorded. Never deletes data.
export async function setIncomeModel(slug: string, formData: FormData) {
  await requireAdmin() // managers/owner only
  const supabase = createClient()
  const model = String(formData.get('income_model') ?? '').trim()
  if (model !== 'simple' && model !== 'sales') return
  const { error } = await supabase.from('clients').update({ income_model: model }).eq('slug', slug)
  if (error) redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent(error.message)}`)
  revalidatePath(`/admin/clients/${slug}`)
  revalidatePath(`/admin/clients/${slug}/account`)
  redirect(
    `/admin/clients/${slug}/account?ok=${encodeURIComponent(
      model === 'sales' ? 'Income tracking set to Sales journal.' : 'Income tracking set to Simple income.'
    )}`
  )
}

// Inline single-field edit from the entity info sheet.
export async function updateEntityField(slug: string, field: string, raw: string) {
  await requireAdmin() // managers/owner only
  const supabase = createClient()
  if (!EDITABLE_FIELDS.has(field)) return
  const trimmed = (raw ?? '').trim()
  if (field === 'name' && trimmed === '') return // name is required — ignore blanks

  let value: string | number | null = trimmed === '' ? null : trimmed
  if (field === 'employee_count') value = value == null ? null : parseInt(String(value), 10)

  await supabase.from('clients').update({ [field]: value }).eq('slug', slug)

  // A hand-entered value is verified ground truth.
  if (value != null && String(value).trim() !== '') {
    const { data: cli } = await supabase.from('clients').select('id').eq('slug', slug).single()
    if (cli?.id) await markVerified(supabase, cli.id as string, [field])
  }

  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`/admin/clients/${slug}`)
  revalidatePath('/admin')
}

export async function addOfficer(slug: string, formData: FormData) {
  await requireWorker() // owner/manager/collaborator — officers are operational data
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  const name = str(formData, 'name')
  if (!client || !name) {
    redirect(`/admin/clients/${slug}/account?warn=${encodeURIComponent('Officer name is required.')}`)
  }
  await supabase.from('entity_officers').insert({
    client_id: client!.id,
    name,
    title: str(formData, 'title'),
    ownership_pct: num(formData, 'ownership_pct'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone'),
  })
  revalidatePath(`/admin/clients/${slug}/account`)
  redirect(`/admin/clients/${slug}/account`)
}

export async function deleteOfficer(slug: string, id: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('entity_officers').delete().eq('id', id)
  revalidatePath(`/admin/clients/${slug}/account`)
  redirect(`/admin/clients/${slug}/account`)
}

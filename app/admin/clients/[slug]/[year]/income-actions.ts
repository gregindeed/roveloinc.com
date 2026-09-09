'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { SCHEDULE_C_EXPENSES, SCHEDULE_E_EXPENSES } from '@/lib/income'

const back = (slug: string, year: string | number, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/${year}/income?${key}=${encodeURIComponent(msg)}`)

// Parse a currency-ish string to a number (blank → null, or 0 when required).
function num(v: FormDataEntryValue | null, required = false): number | null {
  const s = String(v ?? '').replace(/[$,\s]/g, '').trim()
  if (!s) return required ? 0 : null
  const n = Number(s)
  return Number.isFinite(n) ? n : required ? 0 : null
}

async function clientIdForSlug(supabase: ReturnType<typeof createClient>, slug: string) {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return (data?.id as string | undefined) ?? null
}

// ── W-2 ──────────────────────────────────────────────────────────────────────
export async function addW2(slug: string, year: number, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const clientId = await clientIdForSlug(supabase, slug)
  if (!clientId) back(slug, year, 'warn', 'Client not found.')

  const employer = String(formData.get('employer_name') || '').trim()
  if (!employer) back(slug, year, 'warn', 'Employer name is required.')

  const { error } = await supabase.from('w2_income').insert({
    client_id: clientId,
    year,
    employer_name: employer,
    employer_ein: String(formData.get('employer_ein') || '').trim() || null,
    wages: num(formData.get('wages'), true),
    fed_withholding: num(formData.get('fed_withholding'), true),
    ss_wages: num(formData.get('ss_wages')),
    ss_withholding: num(formData.get('ss_withholding')),
    medicare_wages: num(formData.get('medicare_wages')),
    medicare_withholding: num(formData.get('medicare_withholding')),
    state: String(formData.get('state') || '').trim() || null,
    state_wages: num(formData.get('state_wages')),
    state_withholding: num(formData.get('state_withholding')),
  })
  if (error) back(slug, year, 'warn', `Could not add W-2: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'W-2 added.')
}

export async function deleteW2(slug: string, year: number, id: string) {
  await requireAdmin()
  const supabase = createClient()
  const { error } = await supabase.from('w2_income').delete().eq('id', id)
  if (error) back(slug, year, 'warn', `Could not remove: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'W-2 removed.')
}

// ── 1099 ─────────────────────────────────────────────────────────────────────
export async function add1099(slug: string, year: number, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const clientId = await clientIdForSlug(supabase, slug)
  if (!clientId) back(slug, year, 'warn', 'Client not found.')

  const payer = String(formData.get('payer_name') || '').trim()
  if (!payer) back(slug, year, 'warn', 'Payer name is required.')

  const { error } = await supabase.from('income_1099').insert({
    client_id: clientId,
    year,
    form_type: String(formData.get('form_type') || 'nec').trim() || 'nec',
    payer_name: payer,
    payer_tin: String(formData.get('payer_tin') || '').trim() || null,
    amount: num(formData.get('amount'), true),
    fed_withholding: num(formData.get('fed_withholding'), true),
    description: String(formData.get('description') || '').trim() || null,
  })
  if (error) back(slug, year, 'warn', `Could not add 1099: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', '1099 added.')
}

export async function delete1099(slug: string, year: number, id: string) {
  await requireAdmin()
  const supabase = createClient()
  const { error } = await supabase.from('income_1099').delete().eq('id', id)
  if (error) back(slug, year, 'warn', `Could not remove: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', '1099 removed.')
}

// ── Schedule C ────────────────────────────────────────────────────────────────
export async function addScheduleC(slug: string, year: number, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const clientId = await clientIdForSlug(supabase, slug)
  if (!clientId) back(slug, year, 'warn', 'Client not found.')

  const bizName = String(formData.get('business_name') || '').trim()
  if (!bizName) back(slug, year, 'warn', 'Business name is required.')

  // Expense line items arrive as exp_<key> fields; keep only the non-zero ones.
  const expenses: Record<string, number> = {}
  for (const { key } of SCHEDULE_C_EXPENSES) {
    const v = num(formData.get(`exp_${key}`))
    if (v && v !== 0) expenses[key] = v
  }

  const { error } = await supabase.from('schedule_c').insert({
    client_id: clientId,
    year,
    business_name: bizName,
    principal_activity: String(formData.get('principal_activity') || '').trim() || null,
    naics_code: String(formData.get('naics_code') || '').trim() || null,
    accounting_method: String(formData.get('accounting_method') || 'cash').trim() || 'cash',
    gross_receipts: num(formData.get('gross_receipts'), true),
    returns_allowances: num(formData.get('returns_allowances'), true),
    cogs: num(formData.get('cogs'), true),
    expenses,
  })
  if (error) back(slug, year, 'warn', `Could not add Schedule C: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'Schedule C added.')
}

export async function deleteScheduleC(slug: string, year: number, id: string) {
  await requireAdmin()
  const supabase = createClient()
  const { error } = await supabase.from('schedule_c').delete().eq('id', id)
  if (error) back(slug, year, 'warn', `Could not remove: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'Schedule C removed.')
}

// ── Schedule E — rental / royalty ─────────────────────────────────────────────
export async function addScheduleE(slug: string, year: number, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const clientId = await clientIdForSlug(supabase, slug)
  if (!clientId) back(slug, year, 'warn', 'Client not found.')

  const label = String(formData.get('property_label') || '').trim()
  if (!label) back(slug, year, 'warn', 'Property name is required.')

  const expenses: Record<string, number> = {}
  for (const { key } of SCHEDULE_E_EXPENSES) {
    const v = num(formData.get(`exp_${key}`))
    if (v && v !== 0) expenses[key] = v
  }

  const { error } = await supabase.from('schedule_e').insert({
    client_id: clientId,
    year,
    property_label: label,
    property_type: String(formData.get('property_type') || 'residential').trim() || 'residential',
    address: String(formData.get('address') || '').trim() || null,
    rents_received: num(formData.get('rents_received'), true),
    expenses,
  })
  if (error) back(slug, year, 'warn', `Could not add property: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'Rental property added.')
}

export async function deleteScheduleE(slug: string, year: number, id: string) {
  await requireAdmin()
  const supabase = createClient()
  const { error } = await supabase.from('schedule_e').delete().eq('id', id)
  if (error) back(slug, year, 'warn', `Could not remove: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  back(slug, year, 'ok', 'Rental property removed.')
}

// ── Itemized deductions + credits (one row per client per year) ──────────────
export async function setDeductions(slug: string, year: number, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const clientId = await clientIdForSlug(supabase, slug)
  if (!clientId) back(slug, year, 'warn', 'Client not found.')

  const { error } = await supabase.from('tax_deductions').upsert(
    {
      client_id: clientId,
      year,
      medical: num(formData.get('medical'), true),
      state_local_taxes: num(formData.get('state_local_taxes'), true),
      mortgage_interest: num(formData.get('mortgage_interest'), true),
      charitable: num(formData.get('charitable'), true),
      other_itemized: num(formData.get('other_itemized'), true),
      estimated_credits: num(formData.get('estimated_credits'), true),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,year' }
  )
  if (error) back(slug, year, 'warn', `Could not save deductions: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/${year}/income`)
  revalidatePath(`/admin/clients/${slug}/${year}/planning`)
  back(slug, year, 'ok', 'Deductions saved.')
}

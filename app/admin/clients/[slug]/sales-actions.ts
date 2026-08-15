'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Staff-only guard (owner / manager / collaborator). RLS also enforces this at
// the database, but we fail fast + redirect here for a clean UX.
async function staff() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return { supabase, user }
}

async function clientIdFor(supabase: Awaited<ReturnType<typeof staff>>['supabase'], slug: string) {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return (data?.id as string) ?? null
}

const TENDERS = new Set(['cash', 'card', 'check', 'ach', 'financing', 'other'])

// Add one sales-journal line. Manual staff entries post straight to the books.
export async function addSalesEntry(slug: string, formData: FormData) {
  const { supabase, user } = await staff()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return

  const entry_date = String(formData.get('entry_date') ?? '').trim()
  const amountRaw = String(formData.get('amount') ?? '').trim()
  const amount = Number(amountRaw)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date) || amountRaw === '' || Number.isNaN(amount)) return

  const account_id = String(formData.get('account_id') ?? '').trim() || null
  const tenderRaw = String(formData.get('tender') ?? 'other').trim()
  const tender = TENDERS.has(tenderRaw) ? tenderRaw : 'other'
  const processor = String(formData.get('processor') ?? '').trim() || null
  const qtyRaw = String(formData.get('qty') ?? '').trim()
  const qtyNum = qtyRaw ? parseInt(qtyRaw, 10) : NaN
  const qty = Number.isNaN(qtyNum) ? null : qtyNum
  const memo = String(formData.get('memo') ?? '').trim() || null

  await supabase.from('sales_entries').insert({
    client_id: clientId,
    entry_date,
    account_id,
    tender,
    processor,
    amount,
    qty,
    memo,
    source: 'manual',
    status: 'posted',
    created_by: user.id,
  })
  revalidatePath(`/admin/clients/${slug}/sales`)
}

export type ImportRow = {
  entry_date: string
  account_id: string | null
  tender: string
  qty: number | null
  amount: number
  memo?: string | null
}

// Bulk-insert sales rows parsed + previewed in the browser (CSV / spreadsheet
// import). Staff review the preview before importing, so rows post directly.
export async function bulkAddSalesEntries(
  slug: string,
  rows: ImportRow[]
): Promise<{ ok: boolean; inserted: number; error: string | null }> {
  const { supabase, user } = await staff()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, inserted: 0, error: 'Entity not found.' }

  const clean = (rows || [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.entry_date) && typeof r.amount === 'number' && !Number.isNaN(r.amount))
    .slice(0, 2000)
    .map((r) => ({
      client_id: clientId,
      entry_date: r.entry_date,
      account_id: r.account_id || null,
      tender: TENDERS.has(r.tender) ? r.tender : 'other',
      qty: r.qty != null && !Number.isNaN(r.qty) ? r.qty : null,
      amount: r.amount,
      memo: r.memo || null,
      source: 'import',
      status: 'posted',
      created_by: user.id,
    }))

  if (!clean.length) return { ok: false, inserted: 0, error: 'No valid rows to import.' }
  const { error } = await supabase.from('sales_entries').insert(clean)
  if (error) return { ok: false, inserted: 0, error: error.message }
  revalidatePath(`/admin/clients/${slug}/sales`)
  return { ok: true, inserted: clean.length, error: null }
}

export async function deleteSalesEntry(slug: string, id: string, _fd?: FormData) {
  const { supabase } = await staff()
  await supabase.from('sales_entries').delete().eq('id', id)
  revalidatePath(`/admin/clients/${slug}/sales`)
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ImportTarget = 'deposits' | 'checking' | 'cc'

export type ImportRow = {
  date: string // YYYY-MM-DD
  description: string
  amount: number
  category?: string | null
  type?: string | null
  check_num?: string | null
  account?: string | null
  personal?: boolean
}

export type ImportResult = { ok: true; count: number } | { ok: false; error: string }

export async function importRows(
  slug: string,
  target: ImportTarget,
  rows: ImportRow[]
): Promise<ImportResult> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false, error: 'Not authorized.' }

  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) return { ok: false, error: 'Client not found.' }

  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No rows to import.' }
  if (rows.length > 2000) return { ok: false, error: 'Too many rows (max 2000 at a time).' }

  let table: string
  let payload: Record<string, unknown>[]
  if (target === 'deposits') {
    table = 'deposits'
    payload = rows.map((r) => ({
      client_id: client.id,
      txn_date: r.date,
      description: r.description,
      type: r.type ?? null,
      category: r.category ?? null,
      amount: r.amount,
    }))
  } else if (target === 'checking') {
    table = 'checking_expenses'
    payload = rows.map((r) => ({
      client_id: client.id,
      txn_date: r.date,
      check_num: r.check_num ?? null,
      description: r.description,
      category: r.category ?? null,
      amount: r.amount,
    }))
  } else {
    table = 'cc_transactions'
    payload = rows.map((r) => ({
      client_id: client.id,
      post_date: r.date,
      txn_date: r.date,
      account: r.account ?? null,
      description: r.description,
      category: r.category ?? null,
      amount: r.amount,
      personal: !!r.personal,
    }))
  }

  const { error } = await supabase.from(table).insert(payload)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/clients/${slug}/transactions`)
  revalidatePath(`/admin/clients/${slug}/expenses`)
  return { ok: true, count: payload.length }
}

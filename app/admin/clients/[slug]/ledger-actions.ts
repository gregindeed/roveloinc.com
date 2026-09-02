'use server'

import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CHART_TEMPLATES, DEFAULT_TEMPLATE_KEY } from '@/lib/coa'
import type { AccountType } from '@/lib/coa'
import { categorizeTransactions, type CategorizeTxn } from '@/lib/ai'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

async function clientIdFor(supabase: Awaited<ReturnType<typeof admin>>, slug: string): Promise<string | null> {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return (data?.id as string) ?? null
}

function revalidate(slug: string) {
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`/admin/clients/${slug}`)
}

// Seed an entity's chart from a template. Idempotent: does nothing if the
// entity already has any accounts (so it can't clobber a live chart).
export async function seedChartOfAccounts(slug: string, templateKey: string) {
  const supabase = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return

  const { count } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if ((count ?? 0) > 0) return // already seeded — never overwrite

  const template = CHART_TEMPLATES[templateKey] ?? CHART_TEMPLATES[DEFAULT_TEMPLATE_KEY]
  const rows = template.accounts.map((a, i) => ({
    client_id: clientId,
    code: a.code,
    name: a.name,
    type: a.type,
    tax_line: a.tax_line ?? null,
    sort: i,
  }))
  await supabase.from('chart_of_accounts').insert(rows)
  revalidateTag(`coa:${clientId}`)
  revalidate(slug)
}

export async function addAccount(slug: string, formData: FormData) {
  const supabase = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const type = String(formData.get('type') ?? '').trim() as AccountType
  if (!code || !name || !type) return
  await supabase.from('chart_of_accounts').insert({ client_id: clientId, code, name, type, sort: 999 })
  revalidateTag(`coa:${clientId}`)
  revalidate(slug)
}

export async function renameAccount(slug: string, id: string, name: string) {
  const supabase = await admin()
  const clean = name.trim()
  if (!clean) return
  await supabase.from('chart_of_accounts').update({ name: clean }).eq('id', id)
  const clientId = await clientIdFor(supabase, slug)
  if (clientId) revalidateTag(`coa:${clientId}`)
  revalidate(slug)
}

// Soft-toggle an account. We keep it (transactions may reference it) but hide
// it from pickers when inactive.
export async function setAccountActive(slug: string, id: string, active: boolean) {
  const supabase = await admin()
  await supabase.from('chart_of_accounts').update({ active }).eq('id', id)
  const clientId = await clientIdFor(supabase, slug)
  if (clientId) revalidateTag(`coa:${clientId}`)
  revalidate(slug)
}

// ── AI categorization ────────────────────────────────────────────────────────

const TABLE_DATE: Record<string, string> = {
  deposits: 'txn_date',
  checking_expenses: 'txn_date',
  cc_transactions: 'post_date',
}

// Map uncategorized transactions in one table to chart accounts via the Overseer.
// Returns the number of transactions categorized. Batches to bound token use.
async function categorizeTable(
  supabase: Awaited<ReturnType<typeof admin>>,
  clientId: string,
  briefing: string | null,
  table: string
): Promise<number> {
  const dateCol = TABLE_DATE[table]
  if (!dateCol) return 0

  const { data: accts } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type')
    .eq('client_id', clientId)
    .eq('active', true)
  const accounts = accts ?? []
  if (accounts.length === 0) return 0
  const idByCode = new Map(accounts.map((a) => [a.code as string, a.id as string]))

  const isCC = table === 'cc_transactions'
  const cols = `id, ${dateCol}, description, category, amount${isCC ? ', personal' : ''}`
  const { data: rows } = await supabase
    .from(table)
    .select(cols)
    .eq('client_id', clientId)
    .is('account_id', null)
    .order(dateCol)
    .limit(200)
  const pending = (rows ?? []) as unknown as Record<string, unknown>[]
  if (pending.length === 0) return 0

  const kind = table === 'deposits' ? 'income' : 'expense'
  let categorized = 0

  // Process in batches of 40.
  for (let i = 0; i < pending.length; i += 40) {
    const batch = pending.slice(i, i + 40)
    const txns: CategorizeTxn[] = batch.map((r) => ({
      id: String(r.id),
      date: String(r[dateCol] ?? ''),
      description: String(r.description ?? ''),
      amount: Number(r.amount ?? 0),
      memo: (r.category as string | null) ?? null,
      personal: isCC ? Boolean(r.personal) : undefined,
    }))

    let mapping: Record<string, string> = {}
    try {
      mapping = await categorizeTransactions(kind, accounts as { code: string; name: string; type: string }[], txns, briefing)
    } catch {
      continue // skip this batch on AI error, keep going
    }

    // Group txn ids by resolved account_id, then one update per account.
    const idsByAccount = new Map<string, string[]>()
    for (const [txnId, code] of Object.entries(mapping)) {
      const accountId = idByCode.get(code)
      if (!accountId) continue
      const arr = idsByAccount.get(accountId) ?? []
      arr.push(txnId)
      idsByAccount.set(accountId, arr)
    }
    for (const [accountId, ids] of idsByAccount) {
      await supabase.from(table).update({ account_id: accountId }).in('id', ids)
      categorized += ids.length
    }
  }
  return categorized
}

async function runCategorize(slug: string, tables: string[]) {
  const supabase = await admin()
  const { data: client } = await supabase.from('clients').select('id, overseer_context').eq('slug', slug).single()
  if (!client) return
  const briefing = ((client.overseer_context as string | null) ?? '').trim() || null
  for (const t of tables) {
    await categorizeTable(supabase, client.id as string, briefing, t)
  }
  revalidatePath(`/admin/clients/${slug}/transactions`)
  revalidatePath(`/admin/clients/${slug}/expenses`)
}

// Form actions (trailing FormData from the <form> is ignored).
export async function autoCategorizeDeposits(slug: string, _fd?: FormData) {
  await runCategorize(slug, ['deposits'])
}
export async function autoCategorizeExpenses(slug: string, _fd?: FormData) {
  await runCategorize(slug, ['checking_expenses', 'cc_transactions'])
}
export async function autoCategorizeAll(slug: string) {
  await runCategorize(slug, ['deposits', 'checking_expenses', 'cc_transactions'])
}

// Fast single-row categorization for the unified Transactions list: set (or
// clear) a row's chart-of-accounts account, routing to the right table by
// source. Kept separate from the full-row update actions so a category change
// can't touch the date/description/amount. accountId '' clears to uncategorized.
export async function setTxnAccount(
  slug: string,
  source: 'deposit' | 'checking' | 'card',
  id: string,
  accountId: string | null
) {
  const s = await admin()
  const table = source === 'deposit' ? 'deposits' : source === 'checking' ? 'checking_expenses' : 'cc_transactions'
  const { error } = await s
    .from(table)
    .update({ account_id: accountId && accountId.trim() ? accountId : null })
    .eq('id', id)
  if (error) {
    redirect(`/admin/clients/${slug}/transactions?warn=${encodeURIComponent(`Could not set category: ${error.message}`)}`)
  }
  revalidatePath(`/admin/clients/${slug}/transactions`)
  revalidatePath(`/admin/clients/${slug}/expenses`)
  revalidatePath(`/admin/clients/${slug}/reports`)
  revalidatePath(`/admin/clients/${slug}`)
}

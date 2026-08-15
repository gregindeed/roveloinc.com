import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  exchangePublicToken,
  institutionName,
  getAccounts,
  syncTransactions,
  removeItem,
  type PlaidTxn,
} from '@/lib/plaid'
import { scanAndMatch } from '@/lib/signalsServer'
import { recomputeAndPersist } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

type DB = ReturnType<typeof createClient>
// Admin (service-role) client, used everywhere here because plaid_items is
// service-role-only and the webhook path has no signed-in user.
type Admin = ReturnType<typeof createAdminClient>

export type PlaidItemRow = {
  id: string
  client_id: string
  access_token: string
  cursor: string | null
  institution_name: string | null
}

const nowIso = () => new Date().toISOString()
const desc = (t: PlaidTxn) => (t.merchant_name || t.name || 'Transaction').slice(0, 300)

// Connect a freshly-linked bank: exchange the public token, store the item, and
// pull the first batch of transactions.
export async function connectItem(
  admin: Admin,
  clientId: string,
  clientName: string,
  publicToken: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const { accessToken, itemId } = await exchangePublicToken(publicToken)
    const inst = await institutionName(accessToken)
    // Encrypt the access token before it ever reaches the database.
    const storedToken = await encryptSecret(accessToken)
    const { data: item, error } = await admin
      .from('plaid_items')
      .insert({ client_id: clientId, item_id: itemId, access_token: storedToken, institution_name: inst, status: 'active' })
      .select('id, client_id, access_token, cursor, institution_name')
      .single()
    if (error || !item) return { ok: false, error: error?.message ?? 'Could not store the connection.' }

    await logEvent(admin as unknown as DB, clientId, {
      kind: 'document',
      source: 'overseer',
      title: `Connected a bank feed${inst ? ` — ${inst}` : ''}.`,
      detail: 'Transactions will now flow in automatically.',
    })
    const r = await syncItem(admin, item as PlaidItemRow, clientName)
    return { ok: true, added: r.added }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Plaid connection failed.' }
  }
}

// Pull all available transactions for one item, map them into our ledger tables
// idempotently, then run the pipeline (signals + readiness + registry).
export async function syncItem(admin: Admin, item: PlaidItemRow, clientName?: string): Promise<{ added: number; removed: number }> {
  // Decrypt the stored token once; Plaid always gets the plaintext.
  const accessToken = await decryptSecret(item.access_token)
  const accounts = await getAccounts(accessToken)
  const typeById = new Map(accounts.map((a) => [a.account_id, a.type]))

  let cursor = item.cursor
  const added: PlaidTxn[] = []
  const modified: PlaidTxn[] = []
  const removed: string[] = []
  // Drain the sync feed.
  for (let guard = 0; guard < 50; guard++) {
    const page = await syncTransactions(accessToken, cursor)
    added.push(...page.added)
    modified.push(...page.modified)
    removed.push(...page.removed)
    cursor = page.nextCursor
    if (!page.hasMore) break
  }

  const deposits: Record<string, unknown>[] = []
  const checking: Record<string, unknown>[] = []
  const cc: Record<string, unknown>[] = []

  for (const t of [...added, ...modified]) {
    if (t.pending) continue // only posted transactions
    const kind = typeById.get(t.account_id) // 'depository' | 'credit' | ...
    const amt = Math.round(Math.abs(t.amount) * 100) / 100
    if (kind === 'depository') {
      // Plaid: positive = money OUT of the account; negative = money IN.
      if (t.amount > 0) checking.push({ client_id: item.client_id, txn_date: t.date, description: desc(t), amount: amt, plaid_txn_id: t.transaction_id })
      else if (t.amount < 0) deposits.push({ client_id: item.client_id, txn_date: t.date, description: desc(t), amount: amt, plaid_txn_id: t.transaction_id })
    } else if (kind === 'credit') {
      // Positive = a charge; negative = a payment/credit (handled on the bank side).
      if (t.amount > 0)
        cc.push({
          client_id: item.client_id,
          post_date: t.date,
          txn_date: t.date,
          account: item.institution_name ?? 'Card',
          description: desc(t),
          amount: amt,
          personal: false,
          plaid_txn_id: t.transaction_id,
        })
    }
  }

  const db = admin
  if (deposits.length) await db.from('deposits').upsert(deposits, { onConflict: 'plaid_txn_id' })
  if (checking.length) await db.from('checking_expenses').upsert(checking, { onConflict: 'plaid_txn_id' })
  if (cc.length) await db.from('cc_transactions').upsert(cc, { onConflict: 'plaid_txn_id' })

  if (removed.length) {
    await db.from('deposits').delete().in('plaid_txn_id', removed)
    await db.from('checking_expenses').delete().in('plaid_txn_id', removed)
    await db.from('cc_transactions').delete().in('plaid_txn_id', removed)
  }

  await db.from('plaid_items').update({ cursor, last_synced_at: nowIso(), status: 'active', updated_at: nowIso() }).eq('id', item.id)

  const addedCount = deposits.length + checking.length + cc.length
  if (addedCount > 0) {
    await logEvent(admin as unknown as DB, item.client_id, {
      kind: 'document',
      source: 'overseer',
      title: `Pulled ${addedCount} new transaction${addedCount === 1 ? '' : 's'} from the bank feed${item.institution_name ? ` (${item.institution_name})` : ''}.`,
    })
  }

  // Pipeline: detect signals / auto-satisfy obligations + refresh readiness.
  try {
    await scanAndMatch(admin as unknown as DB, item.client_id)
  } catch {
    await recomputeAndPersist(admin as unknown as DB, item.client_id)
  }
  void clientName
  return { added: addedCount, removed: removed.length }
}

// Sync every active item for a client (used by the manual "Sync now").
export async function syncClient(admin: Admin, clientId: string): Promise<{ added: number; removed: number }> {
  const { data: items } = await admin
    .from('plaid_items')
    .select('id, client_id, access_token, cursor, institution_name')
    .eq('client_id', clientId)
    .eq('status', 'active')
  let added = 0
  let removed = 0
  for (const it of items ?? []) {
    const r = await syncItem(admin, it as PlaidItemRow)
    added += r.added
    removed += r.removed
  }
  return { added, removed }
}

export async function disconnectItem(admin: Admin, itemId: string): Promise<void> {
  const { data: item } = await admin.from('plaid_items').select('id, access_token, client_id, institution_name').eq('id', itemId).single()
  if (!item) return
  await removeItem(await decryptSecret(item.access_token as string))
  await admin.from('plaid_items').delete().eq('id', itemId)
  await logEvent(admin as unknown as DB, item.client_id as string, {
    kind: 'document',
    source: 'operator',
    title: `Disconnected the bank feed${item.institution_name ? ` (${item.institution_name})` : ''}.`,
  })
}

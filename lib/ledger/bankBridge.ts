import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { postTransaction } from '@/lib/ledger/posting'

type DB = ReturnType<typeof createClient>

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100

// A bank movement becomes ONE balanced ledger entry. The categorized account is
// always the offset — whatever its type (expense, asset, liability, transfer) —
// and the other side is the bank (or, for card charges, card payable):
//   deposit  (money in)  → Dr Bank            / Cr <categorized>
//   checking (money out) → Dr <categorized>   / Cr Bank
//   card     (charge)    → Dr <categorized>   / Cr Card Payable
// Idempotent: a row already posted (its source_type:source_id present in the
// ledger) is skipped, so re-running only picks up new/newly-categorized rows.

async function postedSourceKeys(db: DB, clientId: string): Promise<Set<string>> {
  const { data } = await db
    .from('ledger_transactions')
    .select('source_type, source_id')
    .eq('client_id', clientId)
    .in('source_type', ['deposit', 'checking', 'cc'])
  const s = new Set<string>()
  for (const r of (data ?? []) as { source_type: string; source_id: string }[]) {
    s.add(`${r.source_type}:${r.source_id}`)
  }
  return s
}

// How many categorized bank rows are waiting to post, and how many rows are
// still uncategorized (so the UI can nudge "categorize these first").
// `since` (YYYY-MM-DD, inclusive) scopes the "ready" count to a posting window;
// the uncategorized nudge always reflects the whole entity.
export async function countUnpostedBankRows(
  db: DB,
  clientId: string,
  since?: string | null
): Promise<{ ready: number; uncategorized: number }> {
  let depQ = db.from('deposits').select('id').eq('client_id', clientId).not('account_id', 'is', null)
  let chkQ = db.from('checking_expenses').select('id').eq('client_id', clientId).not('account_id', 'is', null)
  let ccQ = db.from('cc_transactions').select('id').eq('client_id', clientId).not('account_id', 'is', null).eq('personal', false)
  if (since) {
    depQ = depQ.gte('txn_date', since)
    chkQ = chkQ.gte('txn_date', since)
    ccQ = ccQ.gte('post_date', since)
  }

  const [{ data: deps }, { data: chks }, { data: ccs }, { count: unDep }, { count: unChk }, { count: unCc }] =
    await Promise.all([
      depQ.limit(100000),
      chkQ.limit(100000),
      ccQ.limit(100000),
      db.from('deposits').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('account_id', null),
      db.from('checking_expenses').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('account_id', null),
      db.from('cc_transactions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('account_id', null).eq('personal', false),
    ])
  const done = await postedSourceKeys(db, clientId)
  let ready = 0
  for (const d of (deps ?? []) as { id: number }[]) if (!done.has(`deposit:${d.id}`)) ready++
  for (const c of (chks ?? []) as { id: number }[]) if (!done.has(`checking:${c.id}`)) ready++
  for (const c of (ccs ?? []) as { id: number }[]) if (!done.has(`cc:${c.id}`)) ready++
  return { ready, uncategorized: (unDep ?? 0) + (unChk ?? 0) + (unCc ?? 0) }
}

type BankRow = { id: number; description: string | null; amount: number; account_id: string }

export async function postBankRows(
  db: DB,
  clientId: string,
  userId: string,
  bankAccountId: string,
  cardAccountId: string | null,
  since?: string | null
): Promise<{ posted: number; skipped: number }> {
  let depQ = db.from('deposits').select('id, txn_date, description, amount, account_id').eq('client_id', clientId).not('account_id', 'is', null)
  let chkQ = db.from('checking_expenses').select('id, txn_date, description, amount, account_id').eq('client_id', clientId).not('account_id', 'is', null)
  let ccQ = db.from('cc_transactions').select('id, post_date, description, amount, account_id, personal').eq('client_id', clientId).not('account_id', 'is', null).eq('personal', false)
  if (since) {
    depQ = depQ.gte('txn_date', since)
    chkQ = chkQ.gte('txn_date', since)
    ccQ = ccQ.gte('post_date', since)
  }
  const [{ data: deps }, { data: chks }, { data: ccs }] = await Promise.all([
    depQ.limit(100000),
    chkQ.limit(100000),
    ccQ.limit(100000),
  ])
  const done = await postedSourceKeys(db, clientId)

  let posted = 0
  let skipped = 0
  const bump = (ok: boolean) => {
    if (ok) posted += 1
    else skipped += 1
  }

  // Deposits: Dr Bank / Cr offset
  for (const d of (deps ?? []) as (BankRow & { txn_date: string })[]) {
    if (done.has(`deposit:${d.id}`)) continue
    const amt = money(d.amount)
    if (amt <= 0) { skipped++; continue }
    const r = await postTransaction({
      clientId, txnType: 'cash_receipt', sourceType: 'deposit', sourceId: String(d.id),
      documentDate: d.txn_date, memo: d.description ?? null, createdBy: userId,
      lines: [{ accountId: bankAccountId, debit: amt }, { accountId: d.account_id, credit: amt }],
    })
    bump(r.ok)
  }

  // Checking outflows: Dr offset / Cr Bank
  for (const c of (chks ?? []) as (BankRow & { txn_date: string })[]) {
    if (done.has(`checking:${c.id}`)) continue
    const amt = money(c.amount)
    if (amt <= 0) { skipped++; continue }
    const r = await postTransaction({
      clientId, txnType: 'cash_disbursement', sourceType: 'checking', sourceId: String(c.id),
      documentDate: c.txn_date, memo: c.description ?? null, createdBy: userId,
      lines: [{ accountId: c.account_id, debit: amt }, { accountId: bankAccountId, credit: amt }],
    })
    bump(r.ok)
  }

  // Card charges: Dr offset / Cr Card Payable (needs a card account)
  for (const cc of (ccs ?? []) as (BankRow & { post_date: string })[]) {
    if (done.has(`cc:${cc.id}`)) continue
    if (!cardAccountId) { skipped++; continue }
    const amt = money(cc.amount)
    if (amt <= 0) { skipped++; continue }
    const r = await postTransaction({
      clientId, txnType: 'card_charge', sourceType: 'cc', sourceId: String(cc.id),
      documentDate: cc.post_date, memo: cc.description ?? null, createdBy: userId,
      lines: [{ accountId: cc.account_id, debit: amt }, { accountId: cardAccountId, credit: amt }],
    })
    bump(r.ok)
  }

  return { posted, skipped }
}

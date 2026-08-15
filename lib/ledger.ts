import type { Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

// The unified transaction model. Deposits, checking withdrawals, and card charges
// are already near-identical rows in three tables; this normalizes them into one
// list — the "all transactions" spine the books are categorized and reconciled
// from. It's a read/presentation model: the physical tables are untouched, so
// every importer, the Plaid feed, and the reconcile engine keep working as-is.
export type LedgerSource = 'deposit' | 'checking' | 'card'

export const SOURCE_LABEL: Record<LedgerSource, string> = {
  deposit: 'Bank in',
  checking: 'Bank out',
  card: 'Card',
}

export type LedgerTxn = {
  id: string
  source: LedgerSource
  direction: 'in' | 'out'
  date: string
  description: string
  amount: number
  accountId: string | null
  personal: boolean
}

// Newest first; ties broken by source so the order is stable across renders.
function byDateDesc(a: LedgerTxn, b: LedgerTxn): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.source < b.source ? -1 : a.source > b.source ? 1 : 0
}

export function unifyLedger(
  deposits: Deposit[],
  checking: CheckingExpense[],
  cc: CCTransaction[]
): LedgerTxn[] {
  const rows: LedgerTxn[] = []

  for (const d of deposits) {
    rows.push({
      id: String(d.id),
      source: 'deposit',
      direction: 'in',
      date: d.txn_date,
      description: d.description,
      amount: Number(d.amount),
      accountId: d.account_id ?? null,
      personal: false,
    })
  }
  for (const c of checking) {
    rows.push({
      id: String(c.id),
      source: 'checking',
      direction: 'out',
      date: c.txn_date,
      description: c.description,
      amount: Number(c.amount),
      accountId: c.account_id ?? null,
      personal: false,
    })
  }
  for (const t of cc) {
    rows.push({
      id: String(t.id),
      source: 'card',
      direction: 'out',
      date: t.post_date,
      description: t.description,
      amount: Number(t.amount),
      accountId: t.account_id ?? null,
      personal: !!t.personal,
    })
  }

  return rows.sort(byDateDesc)
}

export type LedgerTotals = { in: number; out: number; net: number; uncategorized: number }

export function ledgerTotals(rows: LedgerTxn[]): LedgerTotals {
  let inSum = 0
  let outSum = 0
  let uncategorized = 0
  for (const r of rows) {
    if (r.direction === 'in') inSum += r.amount
    else outSum += r.amount
    // Personal card rows are intentionally excluded from the books, so they
    // don't count as "needs a category".
    if (!r.accountId && !r.personal) uncategorized += 1
  }
  return { in: inSum, out: outSum, net: inSum - outSum, uncategorized }
}

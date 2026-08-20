import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getChartOfAccounts } from '@/lib/coaServer'
import { countUnpostedBankRows } from '@/lib/ledger/bankBridge'
import ManualJournalForm from '@/components/ManualJournalForm'
import PostBankActivity from '@/components/PostBankActivity'
import LedgerView, { type LedgerTxnRow, type LedgerLineRow } from '@/components/LedgerView'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function LedgerPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: client } = await supabase
    .from('clients')
    .select('id, slug, name, ledger_bank_account_id, ledger_card_account_id')
    .eq('slug', params.slug)
    .single()
  if (!client) notFound()

  const now = new Date()
  const yr = now.getUTCFullYear()
  const windowDefs: { key: string; label: string; since: string | null }[] = [
    { key: 'ytd', label: String(yr), since: `${yr}-01-01` },
    { key: 'prev2', label: `${yr - 1}–${yr}`, since: `${yr - 1}-01-01` },
    { key: 'all', label: 'All history', since: null },
  ]

  const [{ data: txns }, accounts, windowCounts] = await Promise.all([
    supabase
      .from('ledger_transactions')
      .select('id, human_id, txn_type, document_date, posting_date, status, memo, reversal_of_id')
      .eq('client_id', client.id)
      .eq('status', 'posted')
      .order('posting_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    getChartOfAccounts(client.id),
    Promise.all(windowDefs.map((w) => countUnpostedBankRows(supabase, client.id as string, w.since))),
  ])
  const windows = windowDefs.map((w, i) => ({ key: w.key, label: w.label, since: w.since, ready: windowCounts[i]?.ready ?? 0 }))
  const uncategorized = windowCounts[windowCounts.length - 1]?.uncategorized ?? 0

  const txnRows = (txns ?? []) as Omit<LedgerTxnRow, 'lines'>[]
  const ids = txnRows.map((t) => t.id)
  const { data: lineRows } = ids.length
    ? await supabase
        .from('ledger_lines')
        .select('id, transaction_id, account_id, debit, credit, description')
        .in('transaction_id', ids)
    : { data: [] as (LedgerLineRow & { transaction_id: string })[] }

  const byTxn = new Map<string, LedgerLineRow[]>()
  for (const l of (lineRows ?? []) as (LedgerLineRow & { transaction_id: string })[]) {
    const arr = byTxn.get(l.transaction_id) ?? []
    arr.push({ id: l.id, account_id: l.account_id, debit: Number(l.debit), credit: Number(l.credit), description: l.description })
    byTxn.set(l.transaction_id, arr)
  }
  const transactions: LedgerTxnRow[] = txnRows.map((t) => ({ ...t, lines: byTxn.get(t.id) ?? [] }))

  // Suggest the bank + card-payable accounts (chart templates seed 1010 / 2010).
  const assets = accounts.filter((a) => a.type === 'asset')
  const liabilities = accounts.filter((a) => a.type === 'liability')
  const suggestedBank =
    (accounts.find((a) => a.code === '1010') ?? assets.find((a) => /bank|cash|checking/i.test(a.name)) ?? assets[0])?.id ?? null
  const suggestedCard =
    (accounts.find((a) => a.code === '2010') ?? liabilities.find((a) => /credit\s*card|card payable/i.test(a.name)))?.id ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">General ledger</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Every posted transaction, balanced to the penny. Post your categorized bank activity into the ledger below, or
          add a manual journal entry for adjustments, opening balances, and corrections.
        </p>
      </div>

      <PostBankActivity
        slug={client.slug}
        accounts={accounts}
        bankAccountId={(client.ledger_bank_account_id as string | null) ?? null}
        cardAccountId={(client.ledger_card_account_id as string | null) ?? null}
        suggestedBank={suggestedBank}
        suggestedCard={suggestedCard}
        windows={windows}
        uncategorized={uncategorized}
      />

      <ManualJournalForm slug={client.slug} accounts={accounts} />

      <LedgerView slug={client.slug} transactions={transactions} accounts={accounts} />
    </div>
  )
}

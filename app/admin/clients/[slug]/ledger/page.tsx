import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getChartOfAccounts } from '@/lib/coaServer'
import ManualJournalForm from '@/components/ManualJournalForm'
import LedgerView, { type LedgerTxnRow, type LedgerLineRow } from '@/components/LedgerView'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function LedgerPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug, name').eq('slug', params.slug).single()
  if (!client) notFound()

  const [{ data: txns }, accounts] = await Promise.all([
    supabase
      .from('ledger_transactions')
      .select('id, human_id, txn_type, document_date, posting_date, status, memo, reversal_of_id')
      .eq('client_id', client.id)
      .eq('status', 'posted')
      .order('posting_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    getChartOfAccounts(client.id),
  ])

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">General ledger</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Every posted transaction, balanced to the penny. Bank activity, sales, and payments will post here as those
          workflows come online; for now you can post manual journal entries — adjustments, opening balances, corrections.
        </p>
      </div>

      <ManualJournalForm slug={client.slug} accounts={accounts} />

      <LedgerView slug={client.slug} transactions={transactions} accounts={accounts} />
    </div>
  )
}

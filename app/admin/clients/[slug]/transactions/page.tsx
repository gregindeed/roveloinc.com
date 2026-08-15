import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import UnifiedTransactions from '@/components/UnifiedTransactions'
import { autoCategorizeAll } from '@/app/admin/clients/[slug]/ledger-actions'
import { parsePeriod } from '@/lib/period'
import { unifyLedger, ledgerTotals } from '@/lib/ledger'
import { getChartOfAccounts } from '@/lib/coaServer'
import type { Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { year?: string; q?: string; month?: string; day?: string; warn?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const now = new Date().getFullYear()
  const period = parsePeriod(searchParams, now)

  const [{ data: deposits }, { data: checking }, { data: cc }, accts] = await Promise.all([
    // Period is filtered in the database (gte/lte on the date column) so we only
    // pull the rows the view shows — not the whole history on every load.
    supabase.from('deposits').select('*').eq('client_id', client.id).gte('txn_date', period.from).lte('txn_date', period.to).order('txn_date'),
    supabase.from('checking_expenses').select('*').eq('client_id', client.id).gte('txn_date', period.from).lte('txn_date', period.to).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', client.id).gte('post_date', period.from).lte('post_date', period.to).order('post_date'),
    // Chart of accounts — cached (tag-invalidated on edits), shared across tabs.
    getChartOfAccounts(client.id),
  ])

  const dep = (deposits ?? []) as Deposit[]
  const chk = (checking ?? []) as CheckingExpense[]
  const card = (cc ?? []) as CCTransaction[]

  const txns = unifyLedger(dep, chk, card)
  const uncategorized = ledgerTotals(txns).uncategorized

  return (
    <div className="space-y-6">
      <PeriodBar years={[now, now - 1, now - 2, now - 3]} />
      {searchParams.warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {searchParams.warn}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Showing {period.label}. Every bank and card movement — in and out — in one place. Categorize each into the
          chart of accounts here; Expenses and Reports roll up from it.
        </p>
        <div className="flex items-center gap-2">
          {accts.length > 0 && uncategorized > 0 && (
            <form action={autoCategorizeAll.bind(null, client.slug)}>
              <button className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5">
                Suggest accounts (AI) · {uncategorized}
              </button>
            </form>
          )}
          <Link
            href={`/admin/clients/${client.slug}/statements`}
            className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors"
          >
            Import statement
          </Link>
          <Link
            href={`/admin/clients/${client.slug}/import?target=checking`}
            className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            Import ↑
          </Link>
        </div>
      </div>
      <UnifiedTransactions slug={client.slug} txns={txns} accounts={accts} />
    </div>
  )
}

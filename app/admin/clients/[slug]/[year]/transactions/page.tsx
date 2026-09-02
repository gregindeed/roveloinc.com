import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { EditableDeposits } from '@/components/EditableTxns'
import { autoCategorizeDeposits } from '@/app/admin/clients/[slug]/ledger-actions'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { Deposit, Account } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: { slug: string; year: string }
  searchParams: { year?: string; q?: string; month?: string; day?: string; warn?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const year = Number(params.year)
  const period = parsePeriod({ ...searchParams, year: params.year }, year)

  const [{ data: deposits }, { data: accounts }] = await Promise.all([
    supabase.from('deposits').select('*').eq('client_id', client.id).order('txn_date'),
    supabase.from('chart_of_accounts').select('*').eq('client_id', client.id).order('code'),
  ])

  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))
  const accts = (accounts ?? []) as Account[]
  const uncategorized = ((deposits ?? []) as Deposit[]).filter((r) => !r.account_id).length

  return (
    <div className="space-y-6">
      <PeriodBar />
      {searchParams.warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {searchParams.warn}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">Showing {period.label}. New rows use whatever date you enter.</p>
        <div className="flex items-center gap-2">
          {accts.length > 0 && uncategorized > 0 && (
            <form action={autoCategorizeDeposits.bind(null, client.slug)}>
              <button className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5">
                Suggest accounts (AI) · {uncategorized}
              </button>
            </form>
          )}
          <Link
            href={`/admin/clients/${client.slug}/${year}/statements`}
            className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors"
          >
            Import statement
          </Link>
          <Link
            href={`/admin/clients/${client.slug}/${year}/import?target=deposits`}
            className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            Import ↑
          </Link>
        </div>
      </div>
      <EditableDeposits deposits={dep} slug={client.slug} accounts={accts} />
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { EditableDeposits } from '@/components/EditableTxns'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { Deposit } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { year?: string; q?: string; month?: string; day?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const now = new Date().getFullYear()
  const period = parsePeriod(searchParams, now)

  const { data: deposits } = await supabase
    .from('deposits')
    .select('*')
    .eq('client_id', client.id)
    .order('txn_date')

  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))

  return (
    <div className="space-y-6">
      <PeriodBar years={[now, now - 1, now - 2, now - 3]} />
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Showing {period.label}. New rows use whatever date you enter.</p>
        <Link
          href={`/admin/clients/${client.slug}/import?target=deposits`}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
        >
          Import ↑
        </Link>
      </div>
      <EditableDeposits deposits={dep} slug={client.slug} />
    </div>
  )
}

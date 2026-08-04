import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { DepositsTable } from '@/components/Financials'
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
  const { data: client } = await supabase.from('clients').select('id').eq('slug', params.slug).single()
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
      <DepositsTable deposits={dep} periodLabel={period.label} />
    </div>
  )
}

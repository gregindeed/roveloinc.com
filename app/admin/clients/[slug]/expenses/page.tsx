import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { ExpensesTables } from '@/components/Financials'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { CheckingExpense, CCTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function ExpensesPage({
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

  const [{ data: checking }, { data: cc }] = await Promise.all([
    supabase.from('checking_expenses').select('*').eq('client_id', client.id).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', client.id).order('post_date'),
  ])

  const chk = ((checking ?? []) as CheckingExpense[]).filter((r) => inPeriod(r.txn_date, period))
  const card = ((cc ?? []) as CCTransaction[]).filter((r) => inPeriod(r.post_date, period))

  return (
    <div className="space-y-6">
      <PeriodBar years={[now, now - 1, now - 2, now - 3]} />
      <ExpensesTables checking={chk} cc={card} periodLabel={period.label} />
    </div>
  )
}

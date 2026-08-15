import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import ReconcileView from '@/components/ReconcileView'
import { reconcile } from '@/lib/reconcile'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { SalesEntry, Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { year?: string; q?: string; month?: string; day?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()
  const cid = client.id as string

  const now = new Date().getFullYear()
  const period = parsePeriod(searchParams, now)

  const [{ data: sales }, { data: deposits }, { data: checking }, { data: cc }, { data: accounts }] = await Promise.all([
    supabase.from('sales_entries').select('*').eq('client_id', cid).eq('status', 'posted').order('entry_date'),
    supabase.from('deposits').select('*').eq('client_id', cid).order('txn_date'),
    supabase.from('checking_expenses').select('*').eq('client_id', cid).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', cid).order('post_date'),
    supabase.from('chart_of_accounts').select('*').eq('client_id', cid).order('code'),
  ])

  const s = ((sales ?? []) as SalesEntry[]).filter((r) => inPeriod(r.entry_date, period))
  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))
  const chk = ((checking ?? []) as CheckingExpense[]).filter((r) => inPeriod(r.txn_date, period))
  const card = ((cc ?? []) as CCTransaction[]).filter((r) => inPeriod(r.post_date, period))
  const accts = (accounts ?? []) as Account[]

  const rec = reconcile(s, dep, chk, card, accts, { from: period.from, to: period.to })

  return (
    <div className="space-y-6">
      <PeriodBar years={[now, now - 1, now - 2, now - 3]} />
      <p className="text-xs text-gray-500">Reconciling {period.label} — the sales journal against bank deposits.</p>
      <ReconcileView rec={rec} periodLabel={period.label} hasSales={s.length > 0} />
    </div>
  )
}

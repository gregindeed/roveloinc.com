import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { FinancialSummary } from '@/components/Financials'
import OverviewCommand from '@/components/OverviewCommand'
import { gatherAndCompute, persistState } from '@/lib/entityStateServer'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { Client, Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function Overview({
  params,
  searchParams,
}: {
  params: { slug: string; year: string }
  searchParams: { ok?: string; warn?: string; q?: string; month?: string; day?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const c = client as Client

  // The year is the workspace context (path segment); the bar slices within it.
  const year = Number(params.year)
  const period = parsePeriod({ ...searchParams, year: params.year }, year)

  const [{ data: deposits }, { data: checking }, { data: cc }, { data: assessment }, { data: accounts }] =
    await Promise.all([
      supabase.from('deposits').select('*').eq('client_id', c.id).order('txn_date'),
      supabase.from('checking_expenses').select('*').eq('client_id', c.id).order('txn_date'),
      supabase.from('cc_transactions').select('*').eq('client_id', c.id).order('post_date'),
      supabase
        .from('ai_assessments')
        .select('content, model, created_at')
        .eq('client_id', c.id)
        .eq('scope', 'overview')
        .maybeSingle(),
      supabase.from('chart_of_accounts').select('*').eq('client_id', c.id).order('code'),
    ])

  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))
  const chk = ((checking ?? []) as CheckingExpense[]).filter((r) => inPeriod(r.txn_date, period))
  const card = ((cc ?? []) as CCTransaction[]).filter((r) => inPeriod(r.post_date, period))

  const state = await gatherAndCompute(supabase, c)
  await persistState(supabase, c.id, state)

  return (
    <div className="space-y-8">
      {searchParams.ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
          {searchParams.ok}
        </div>
      )}
      {searchParams.warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {searchParams.warn}
        </div>
      )}
      <OverviewCommand slug={c.slug} state={state} assessment={assessment} context={c.overseer_context} />
      <PeriodBar />
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Summary · {period.label}</h2>
        <FinancialSummary
          deposits={dep}
          checking={chk}
          cc={card}
          accounts={(accounts ?? []) as Account[]}
          periodLabel={period.label}
          slug={c.slug}
          year={year}
        />
      </div>
    </div>
  )
}

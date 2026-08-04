import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { FinancialSummary } from '@/components/Financials'
import AssessmentCard from '@/components/AssessmentCard'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { Client, Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function Overview({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { ok?: string; warn?: string; year?: string; q?: string; month?: string; day?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const c = client as Client

  const now = new Date().getFullYear()
  const years = [now, now - 1, now - 2, now - 3]
  const period = parsePeriod(searchParams, now)

  const [{ data: deposits }, { data: checking }, { data: cc }, { data: assessment }] = await Promise.all([
    supabase.from('deposits').select('*').eq('client_id', c.id).order('txn_date'),
    supabase.from('checking_expenses').select('*').eq('client_id', c.id).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', c.id).order('post_date'),
    supabase
      .from('ai_assessments')
      .select('content, model, created_at')
      .eq('client_id', c.id)
      .eq('scope', 'overview')
      .maybeSingle(),
  ])

  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))
  const chk = ((checking ?? []) as CheckingExpense[]).filter((r) => inPeriod(r.txn_date, period))
  const card = ((cc ?? []) as CCTransaction[]).filter((r) => inPeriod(r.post_date, period))

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
      <AssessmentCard slug={c.slug} scope="overview" assessment={assessment} />
      <PeriodBar years={years} />
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Summary · {period.label}</h2>
        <FinancialSummary deposits={dep} checking={chk} cc={card} periodLabel={period.label} />
      </div>
    </div>
  )
}

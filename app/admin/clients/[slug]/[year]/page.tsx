import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import { FinancialSummary } from '@/components/Financials'
import { gatherAndCompute, persistState } from '@/lib/entityStateServer'
import { parsePeriod, inPeriod } from '@/lib/period'
import Link from 'next/link'
import { computeIncome, type W2Income, type Income1099, type ScheduleC, type ScheduleE } from '@/lib/income'
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

  const [{ data: deposits }, { data: checking }, { data: cc }, { data: accounts }] =
    await Promise.all([
      supabase.from('deposits').select('*').eq('client_id', c.id).order('txn_date'),
      supabase.from('checking_expenses').select('*').eq('client_id', c.id).order('txn_date'),
      supabase.from('cc_transactions').select('*').eq('client_id', c.id).order('post_date'),
      supabase.from('chart_of_accounts').select('*').eq('client_id', c.id).order('code'),
    ])

  const dep = ((deposits ?? []) as Deposit[]).filter((r) => inPeriod(r.txn_date, period))
  const chk = ((checking ?? []) as CheckingExpense[]).filter((r) => inPeriod(r.txn_date, period))
  const card = ((cc ?? []) as CCTransaction[]).filter((r) => inPeriod(r.post_date, period))

  // The readiness snapshot is still computed + persisted here so the clients
  // roster's attention view stays fresh (the Overseer card now lives in the
  // year layout, above the tabs).
  const state = await gatherAndCompute(supabase, c)
  await persistState(supabase, c.id, state)

  // For individuals, total the structured income lines for this year so the
  // overview shows a real income picture instead of a placeholder.
  let incomeTotals: ReturnType<typeof computeIncome> | null = null
  if (c.kind === 'individual') {
    const [{ data: w2Rows }, { data: f1099Rows }, { data: scRows }, { data: seRows }] = await Promise.all([
      supabase.from('w2_income').select('*').eq('client_id', c.id).eq('year', year),
      supabase.from('income_1099').select('*').eq('client_id', c.id).eq('year', year),
      supabase.from('schedule_c').select('*').eq('client_id', c.id).eq('year', year),
      supabase.from('schedule_e').select('*').eq('client_id', c.id).eq('year', year),
    ])
    incomeTotals = computeIncome(
      (w2Rows ?? []) as W2Income[],
      (f1099Rows ?? []) as Income1099[],
      (scRows ?? []) as ScheduleC[],
      (seRows ?? []) as ScheduleE[]
    )
  }
  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

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
      {c.kind === 'individual' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Personal return · {year}</h2>
            <Link href={`/admin/clients/${c.slug}/${year}/income`} className="text-xs font-medium text-gray-500 hover:text-gray-900">
              Manage income →
            </Link>
          </div>
          {incomeTotals && incomeTotals.totalIncome !== 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Total income</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">{usd(incomeTotals.totalIncome)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Wages + 1099s + Sch. C net</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">W-2 wages</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">{usd(incomeTotals.w2Wages)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">1099 income</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">{usd(incomeTotals.f1099Total)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{incomeTotals.f1099ByType.map((t) => t.label).join(', ') || '—'}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Sch. C net</p>
                  <p className={`text-lg font-semibold tabular-nums mt-0.5 ${incomeTotals.scheduleCNet < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {usd(incomeTotals.scheduleCNet)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Federal withheld this year: <span className="tabular-nums">{usd(incomeTotals.totalWithholding)}</span>
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 p-5">
              <p className="text-sm text-gray-600">
                No income recorded for {year} yet. Add W-2s, 1099s, and Schedule C businesses on the{' '}
                <Link href={`/admin/clients/${c.slug}/${year}/income`} className="font-medium text-gray-900 hover:text-gray-500">
                  Income
                </Link>{' '}
                tab — or upload the documents under <span className="font-medium">Documents</span> and the Overseer files them.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Summary <span className="font-normal text-gray-400">· {period.label}</span>
            </h2>
            <PeriodBar />
          </div>
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
      )}
    </div>
  )
}

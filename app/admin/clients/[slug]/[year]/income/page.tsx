import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import IncomeWorkspace from '@/components/IncomeWorkspace'
import DeductionsPanel from '@/components/DeductionsPanel'
import { computeIncome, type W2Income, type Income1099, type ScheduleC, type ScheduleE, type TaxDeductions } from '@/lib/income'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function IncomePage({
  params,
  searchParams,
}: {
  params: { slug: string; year: string }
  searchParams: { ok?: string; warn?: string }
}) {
  const supabase = createClient()
  const year = Number(params.year)

  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const c = client as Client
  // Income lines are an individual-only surface — businesses use the ledger.
  if (c.kind !== 'individual') redirect(`/admin/clients/${c.slug}/${year}`)

  const [{ data: w2Rows }, { data: f1099Rows }, { data: scRows }, { data: seRows }, { data: dedRow }] = await Promise.all([
    supabase.from('w2_income').select('*').eq('client_id', c.id).eq('year', year).order('created_at'),
    supabase.from('income_1099').select('*').eq('client_id', c.id).eq('year', year).order('created_at'),
    supabase.from('schedule_c').select('*').eq('client_id', c.id).eq('year', year).order('created_at'),
    supabase.from('schedule_e').select('*').eq('client_id', c.id).eq('year', year).order('created_at'),
    supabase.from('tax_deductions').select('*').eq('client_id', c.id).eq('year', year).maybeSingle(),
  ])

  const w2 = (w2Rows ?? []) as W2Income[]
  const f1099 = (f1099Rows ?? []) as Income1099[]
  const scheduleC = (scRows ?? []) as ScheduleC[]
  const scheduleE = (seRows ?? []) as ScheduleE[]
  const totals = computeIncome(w2, f1099, scheduleC, scheduleE)
  const deductions: TaxDeductions = {
    medical: dedRow?.medical ?? 0,
    state_local_taxes: dedRow?.state_local_taxes ?? 0,
    mortgage_interest: dedRow?.mortgage_interest ?? 0,
    charitable: dedRow?.charitable ?? 0,
    other_itemized: dedRow?.other_itemized ?? 0,
    estimated_credits: dedRow?.estimated_credits ?? 0,
  }

  return (
    <div className="space-y-6">
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

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Income · {year}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total income" value={money(totals.totalIncome)} sub="Wages + 1099s + Sch. C & E net" />
          <Stat label="W-2 wages" value={money(totals.w2Wages)} sub={`${w2.length} form${w2.length === 1 ? '' : 's'}`} />
          <Stat
            label="1099 income"
            value={money(totals.f1099Total)}
            sub={totals.f1099ByType.map((t) => t.label).join(', ') || '—'}
          />
          <Stat label="Federal withheld" value={money(totals.totalWithholding)} sub="W-2 + 1099" />
        </div>
      </div>

      <IncomeWorkspace slug={c.slug} year={year} w2={w2} f1099={f1099} scheduleC={scheduleC} scheduleE={scheduleE} />
      <DeductionsPanel slug={c.slug} year={year} deductions={deductions} />
    </div>
  )
}

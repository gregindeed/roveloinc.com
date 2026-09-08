import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlanningWorkspace from '@/components/PlanningWorkspace'
import { computeIncome, type W2Income, type Income1099, type ScheduleC } from '@/lib/income'
import { computeTaxPosition, asFilingStatus } from '@/lib/tax'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function PlanningPage({ params }: { params: { slug: string; year: string } }) {
  const supabase = createClient()
  const year = Number(params.year)

  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const c = client as Client
  // Planning is an individual-only surface for now (personal tax position).
  if (c.kind !== 'individual') redirect(`/admin/clients/${c.slug}/${year}`)

  const [{ data: w2Rows }, { data: f1099Rows }, { data: scRows }] = await Promise.all([
    supabase.from('w2_income').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('income_1099').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('schedule_c').select('*').eq('client_id', c.id).eq('year', year),
  ])

  const w2 = (w2Rows ?? []) as W2Income[]
  const f1099 = (f1099Rows ?? []) as Income1099[]
  const scheduleC = (scRows ?? []) as ScheduleC[]
  const totals = computeIncome(w2, f1099, scheduleC)
  const w2SsWages = w2.reduce((a, r) => a + (r.ss_wages ?? r.wages ?? 0), 0)

  const hasIncome = totals.totalIncome !== 0 || totals.totalWithholding !== 0

  const position = computeTaxPosition({
    year,
    filingStatus: asFilingStatus(c.filing_status),
    w2Wages: totals.w2Wages,
    w2SsWages,
    otherIncome: totals.f1099Total,
    scheduleCNet: totals.scheduleCNet,
    withholding: totals.totalWithholding,
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Tax planning · {year}</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          A federal estimate built from the income on the {''}
          <span className="font-medium">Income</span> tab. Add or refine income there and this updates.
        </p>
      </div>

      {hasIncome ? (
        <PlanningWorkspace
          position={position}
          w2Wages={totals.w2Wages}
          otherIncome={totals.f1099Total}
          scheduleCNet={totals.scheduleCNet}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 p-6">
          <p className="text-sm text-gray-600">
            No income recorded for {year} yet, so there&apos;s nothing to estimate. Add W-2s, 1099s, or a Schedule C on the{' '}
            <span className="font-medium">Income</span> tab and the tax position will appear here.
          </p>
        </div>
      )}
    </div>
  )
}

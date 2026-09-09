import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlanningWorkspace from '@/components/PlanningWorkspace'
import { computeIncome, type W2Income, type Income1099, type ScheduleC, type ScheduleE } from '@/lib/income'
import { computeTaxPosition, asFilingStatus, asResidency, type TaxPositionInput } from '@/lib/tax'
import { buildTaxPlan } from '@/lib/taxPlan'
import { computeCaTax, isCaResident } from '@/lib/caTax'
import { computeFinancialHealth, buildOverseerRead } from '@/lib/financialHealth'
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

  const [{ data: w2Rows }, { data: f1099Rows }, { data: scRows }, { data: seRows }, { data: dedRow }] = await Promise.all([
    supabase.from('w2_income').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('income_1099').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('schedule_c').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('schedule_e').select('*').eq('client_id', c.id).eq('year', year),
    supabase.from('tax_deductions').select('*').eq('client_id', c.id).eq('year', year).maybeSingle(),
  ])

  const w2 = (w2Rows ?? []) as W2Income[]
  const f1099 = (f1099Rows ?? []) as Income1099[]
  const scheduleC = (scRows ?? []) as ScheduleC[]
  const scheduleE = (seRows ?? []) as ScheduleE[]
  const totals = computeIncome(w2, f1099, scheduleC, scheduleE)
  const w2SsWages = w2.reduce((a, r) => a + (r.ss_wages ?? r.wages ?? 0), 0)

  const hasIncome = totals.totalIncome !== 0 || totals.totalWithholding !== 0

  const itemized = {
    medical: dedRow?.medical ?? 0,
    salt: dedRow?.state_local_taxes ?? 0,
    mortgageInterest: dedRow?.mortgage_interest ?? 0,
    charitable: dedRow?.charitable ?? 0,
    other: dedRow?.other_itemized ?? 0,
  }
  const credits = dedRow?.estimated_credits ?? 0

  const residency = asResidency(c.residency)
  const treatyRate = c.treaty_dividend_rate ?? null
  const taxInput: TaxPositionInput = {
    year,
    filingStatus: asFilingStatus(c.filing_status),
    w2Wages: totals.w2Wages,
    w2SsWages,
    otherIncome: totals.f1099Ordinary, // pure ordinary (dividends/gains handled separately)
    scheduleCNet: totals.scheduleCNet,
    rentalNet: totals.scheduleENet,
    qualifiedDividends: totals.dividends,
    ordinaryDividends: totals.ordinaryDividends,
    longTermGains: totals.longTermGains,
    shortTermGains: totals.shortTermGains,
    withholding: totals.totalWithholding,
    itemized,
    credits,
    residency,
    treatyDividendRate: treatyRate,
  }
  const position = computeTaxPosition(taxInput)

  // CA layers on only for a CA-resident filing as a US resident (NR CA-source
  // tax is a separate regime we don't estimate here).
  const caResident = isCaResident(c.state) && residency === 'resident'
  const caTax = caResident ? computeCaTax(position.agi, taxInput.filingStatus, year) : null
  const plan = buildTaxPlan(position, taxInput, { caResident })
  const firstName = (c.name ?? '').trim().split(/\s+/)[0] || null
  const health = computeFinancialHealth({ position, caTax, plan, firstName })
  const narrative = buildOverseerRead({ position, caTax, plan, firstName })

  // Scenario comparison — meaningful when there are dividends, since the basis
  // and treaty rate move the number the most. Total federal tax under each.
  const scenarioInputs: { key: string; label: string; input: TaxPositionInput }[] = [
    { key: 'resident', label: 'Resident · 1040', input: { ...taxInput, residency: 'resident', treatyDividendRate: null } },
    {
      key: 'nr_treaty',
      label: `Nonresident · treaty ${treatyRate != null ? `${Math.round(treatyRate * 100)}%` : '10%'}`,
      input: { ...taxInput, residency: 'nonresident', treatyDividendRate: treatyRate ?? 0.1 },
    },
    { key: 'nr_30', label: 'Nonresident · 30%', input: { ...taxInput, residency: 'nonresident', treatyDividendRate: null } },
  ]
  const currentKey = residency === 'resident' ? 'resident' : treatyRate != null ? 'nr_treaty' : 'nr_30'
  const scenarios =
    totals.dividends + totals.ordinaryDividends > 0
      ? scenarioInputs.map((s) => {
          const pos = computeTaxPosition(s.input)
          return { key: s.key, label: s.label, totalTax: pos.totalTax, current: s.key === currentKey }
        })
      : []

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
          caTax={caTax}
          plan={plan}
          health={health}
          narrative={narrative}
          scenarios={scenarios}
          w2Wages={totals.w2Wages}
          otherIncome={totals.f1099Ordinary}
          dividends={totals.dividends}
          ordinaryDividends={totals.ordinaryDividends}
          longTermGains={totals.longTermGains}
          shortTermGains={totals.shortTermGains}
          scheduleCNet={totals.scheduleCNet}
          rentalNet={totals.scheduleENet}
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

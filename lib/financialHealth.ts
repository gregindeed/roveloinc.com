// ── Financial-health read + Overseer narrative (Phase 4) ─────────────────────
// A deterministic read on an individual's tax health for the year: a 0–100
// score with the factors behind it, and a short Overseer narrative composed
// from the same computed figures. No model call — always available, consistent
// with the numbers on the Planning tab.

import type { TaxPosition } from '@/lib/tax'
import type { CaTaxPosition } from '@/lib/caTax'
import type { PlanMove } from '@/lib/taxPlan'

export type HealthStatus = 'good' | 'watch' | 'risk'

export type HealthFactor = {
  key: string
  label: string
  status: HealthStatus
  note: string
}

export type FinancialHealth = {
  score: number // 0–100
  grade: string // Strong / Solid / Fair / Needs attention
  summary: string
  factors: HealthFactor[]
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const pctInt = (n: number) => `${Math.round(n * 100)}%`

type Ctx = {
  position: TaxPosition
  caTax: CaTaxPosition | null
  plan: PlanMove[]
  firstName?: string | null
}

export function computeFinancialHealth({ position: p, plan }: Ctx): FinancialHealth {
  const factors: HealthFactor[] = []
  let score = 100

  // 1) Withholding accuracy (federal).
  if (p.totalTax > 0) {
    const refund = p.balance < 0 ? -p.balance : 0
    const owe = p.balance > 0 ? p.balance : 0
    if (owe > Math.max(1000, 0.1 * p.totalTax)) {
      score -= 20
      factors.push({
        key: 'withholding',
        label: 'Withholding',
        status: 'risk',
        note: `Under-withheld by about ${usd(owe)} — set that aside now and consider quarterly estimates to avoid a penalty.`,
      })
    } else if (refund > Math.max(3000, 0.15 * p.totalTax)) {
      score -= 10
      factors.push({
        key: 'withholding',
        label: 'Withholding',
        status: 'watch',
        note: `A projected refund of ${usd(refund)} is an interest-free loan to the IRS — dialing back withholding frees that cash during the year.`,
      })
    } else {
      factors.push({
        key: 'withholding',
        label: 'Withholding',
        status: 'good',
        note: 'Withholding is close to the mark — little owed or refunded at filing.',
      })
    }
  }

  // 2) Pre-tax retirement.
  const retire = plan.find((m) => m.category === 'retirement' && (m.estSavings ?? 0) > 0)
  if (retire) {
    score -= 15
    factors.push({
      key: 'retirement',
      label: 'Retirement',
      status: 'watch',
      note: `Room to shelter more pre-tax — contributing up to ${usd(retire.amount ?? 0)} would cut about ${usd(retire.estSavings ?? 0)} in federal tax.`,
    })
  } else if (p.totalIncome > 0) {
    factors.push({
      key: 'retirement',
      label: 'Retirement',
      status: 'good',
      note: 'Pre-tax retirement looks well used for this income level.',
    })
  }

  // 3) Self-employment / entity structure.
  const scorp = plan.find((m) => m.key === 'scorp')
  if (scorp) {
    score -= 10
    factors.push({
      key: 'structure',
      label: 'Structure',
      status: 'watch',
      note: `Self-employment tax is heavy — modeling an S-corp election could save roughly ${usd(scorp.estSavings ?? 0)}/yr.`,
    })
  } else if (p.seTax > 0) {
    factors.push({
      key: 'structure',
      label: 'Structure',
      status: 'good',
      note: 'Self-employment tax is handled and the structure looks appropriate at this income.',
    })
  }

  // 4) Effective-rate context (informational, never penalized).
  factors.push({
    key: 'rate',
    label: 'Tax rate',
    status: 'good',
    note: `Effective federal rate of ${pct(p.effectiveRate)}, ${pctInt(p.marginalRate)} at the margin.`,
  })

  score = Math.max(0, Math.min(100, score))
  const grade = score >= 85 ? 'Strong' : score >= 70 ? 'Solid' : score >= 55 ? 'Fair' : 'Needs attention'

  const watches = factors.filter((f) => f.status !== 'good')
  const summary =
    watches.length === 0
      ? 'A clean position — the fundamentals look well managed for the year.'
      : `${watches.length} area${watches.length === 1 ? '' : 's'} worth acting on before year-end — see the plan below.`

  return { score, grade, summary, factors }
}

// A short, warm Overseer read composed from the computed figures.
export function buildOverseerRead({ position: p, caTax, plan, firstName }: Ctx): string {
  const who = firstName?.trim() || 'This filer'
  const stateClause = caTax ? `, plus about ${usd(caTax.tax)} in California tax` : ''
  const s: string[] = []

  s.push(
    `${who} is projecting ${usd(p.totalIncome)} of income for ${p.year}, landing in the ${pctInt(p.marginalRate)} federal bracket ` +
      `at a ${pct(p.effectiveRate)} effective rate${stateClause}.`
  )

  if (p.totalTax > 0) {
    if (p.balance > 1000) {
      s.push(`Withholding is running short — about ${usd(p.balance)} would be owed at filing as things stand.`)
    } else if (p.balance < -3000) {
      s.push(`They're on track for a ${usd(-p.balance)} federal refund — money that could be working for them sooner.`)
    } else {
      s.push('Withholding is tracking close to the final bill.')
    }
  }

  const top = plan.find((m) => (m.estSavings ?? 0) > 0)
  if (top) {
    s.push(`The clearest move is to ${top.title.toLowerCase()} — an estimated ${usd(top.estSavings ?? 0)} saved. The full plan is below.`)
  } else {
    s.push('No large levers stand out this year; the plan below covers the housekeeping.')
  }

  return s.join(' ')
}

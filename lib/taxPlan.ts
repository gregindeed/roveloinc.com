// ── Tax planner (Phase 4) ────────────────────────────────────────────────────
// Turns a computed tax position into concrete, ranked moves with an estimated
// dollar impact. Savings are computed by re-running the same federal engine with
// the move applied (e.g. a pre-tax contribution reduces AGI), so the numbers are
// consistent with the position on the Planning tab — bracket crossings and all.
// Directional moves (S-corp election) are flagged; they need a human to finish.

import { computeTaxPosition, type TaxPosition, type TaxPositionInput } from '@/lib/tax'
import { computeCaTax } from '@/lib/caTax'

type RetirementLimits = { deferral401k: number; ira: number; dc415c: number; compCap: number }

const LIMITS: Record<number, RetirementLimits> = {
  2024: { deferral401k: 23000, ira: 7000, dc415c: 69000, compCap: 345000 },
  2025: { deferral401k: 23500, ira: 7000, dc415c: 70000, compCap: 350000 },
  2026: { deferral401k: 24500, ira: 7500, dc415c: 72000, compCap: 360000 },
}
const LIMIT_YEARS = Object.keys(LIMITS).map(Number).sort((a, b) => a - b)
function limitsFor(year: number): RetirementLimits {
  if (LIMITS[year]) return LIMITS[year]
  const nearest = LIMIT_YEARS.reduce((b, y) => (Math.abs(y - year) < Math.abs(b - year) ? y : b), LIMIT_YEARS[0])
  return LIMITS[nearest]
}

export type PlanCategory = 'retirement' | 'entity' | 'timing' | 'compliance'

export type PlanMove = {
  key: string
  category: PlanCategory
  title: string
  detail: string
  action?: string
  amount: number | null // the suggested dollar figure (contribution / target)
  estSavings: number | null // annual federal tax reduction; null = informational
  confidence: 'estimate' | 'directional'
}

const round100 = (n: number) => Math.round(n / 100) * 100
const SE_NET_FACTOR = 0.9235
const SS_RATE = 0.124
const MEDICARE_RATE = 0.029

export function buildTaxPlan(base: TaxPosition, input: TaxPositionInput, opts?: { caResident?: boolean }): PlanMove[] {
  const moves: PlanMove[] = []
  if (base.totalIncome <= 0) return moves

  const L = limitsFor(base.year)
  const table = { ssWageBase: base.year >= 2026 ? 184500 : base.year === 2025 ? 176100 : 168600 }

  // CA state tax rolls into the savings so a move's dollar impact is the full
  // (federal + California) reduction for a CA resident.
  const caResident = !!opts?.caResident
  const stateTaxAt = (agi: number) => (caResident ? computeCaTax(agi, input.filingStatus, base.year).tax : 0)
  const baseTotal = base.totalTax + stateTaxAt(base.agi)

  // Re-run the engine with an added pre-tax adjustment and return the tax saved.
  const savingsFor = (extraPreTax: number): number => {
    const alt = computeTaxPosition({ ...input, preTaxAdjustments: (input.preTaxAdjustments ?? 0) + extraPreTax })
    return Math.max(0, baseTotal - (alt.totalTax + stateTaxAt(alt.agi)))
  }

  const selfEmployed = input.scheduleCNet > 0
  const netSEbase = selfEmployed ? Math.max(0, input.scheduleCNet * SE_NET_FACTOR - base.seTaxDeduction) : 0

  // ── 1) Pre-tax retirement ──────────────────────────────────────────────────
  if (selfEmployed) {
    const employee = Math.min(L.deferral401k, netSEbase)
    const employer = 0.2 * netSEbase
    const contribution = round100(Math.min(employee + employer, L.dc415c, netSEbase))
    if (contribution >= 500) {
      const saved = savingsFor(contribution)
      if (saved >= 50) {
        moves.push({
          key: 'solo401k',
          category: 'retirement',
          title: 'Open a Solo 401(k)',
          detail:
            `On ${usd(input.scheduleCNet)} of self-employment profit, a Solo 401(k) lets this person set aside up to about ` +
            `${usd(contribution)} pre-tax for ${base.year} (employee deferral plus a ~20% employer contribution). A SEP-IRA is ` +
            `simpler but usually allows less at this income.`,
          action: `Set up a Solo 401(k) and contribute up to ${usd(contribution)} before the deadline.`,
          amount: contribution,
          estSavings: saved,
          confidence: 'estimate',
        })
      }
    }
  } else if (input.w2Wages > 0) {
    const deferral = Math.min(L.deferral401k, input.w2Wages)
    const contribution = round100(deferral + L.ira)
    if (contribution >= 500) {
      const saved = savingsFor(contribution)
      if (saved >= 50) {
        moves.push({
          key: 'employee-retirement',
          category: 'retirement',
          title: 'Max out pre-tax retirement',
          detail:
            `A full 401(k) deferral (${usd(deferral)}) plus a Traditional IRA (${usd(L.ira)}) shelters up to ${usd(contribution)} ` +
            `for ${base.year}. IRA deductibility can phase out at higher incomes when covered by a workplace plan — worth a check.`,
          action: `Increase 401(k) deferral toward ${usd(deferral)} and fund a Traditional IRA up to ${usd(L.ira)}.`,
          amount: contribution,
          estSavings: saved,
          confidence: 'estimate',
        })
      }
    }
  }

  // ── 2) S-corp election (directional) ───────────────────────────────────────
  if (selfEmployed && input.scheduleCNet >= 60000) {
    const salary = round100(0.45 * input.scheduleCNet) // placeholder "reasonable compensation"
    const payrollNew = Math.min(salary, table.ssWageBase) * SS_RATE + salary * MEDICARE_RATE
    const adminCost = 2500 // payroll + separate return, rough
    const saved = Math.max(0, Math.round(base.seTax - payrollNew - adminCost))
    if (saved >= 1500) {
      moves.push({
        key: 'scorp',
        category: 'entity',
        title: 'Model an S-corp election',
        detail:
          `Schedule C net of ${usd(input.scheduleCNet)} carries ${usd(base.seTax)} of self-employment tax. Electing S-corp status and ` +
          `paying a reasonable salary (assumed ~${usd(salary)}) moves the rest to distributions that escape SE tax — a rough net saving of ` +
          `${usd(saved)}/yr after payroll and filing costs. Reasonable comp is fact-specific; confirm before electing.`,
        action: 'Model reasonable compensation and payroll cost, then weigh a Form 2553 S-corp election.',
        amount: saved,
        estSavings: saved,
        confidence: 'directional',
      })
    }
  }

  // ── 3) Bracket-headroom timing (informational) ─────────────────────────────
  if (base.roomToNextBracket != null && base.roomToNextBracket >= 1000 && base.bracketTop != null) {
    moves.push({
      key: 'bracket-timing',
      category: 'timing',
      title: 'Use the room in this bracket',
      detail:
        `About ${usd(base.roomToNextBracket)} of taxable income sits between here and the next rate above ` +
        `${pctInt(base.marginalRate)}. Bunching deductions or deferring income keeps that headroom taxed at ${pctInt(base.marginalRate)} ` +
        `instead of the next bracket up.`,
      amount: base.roomToNextBracket,
      estSavings: null,
      confidence: 'estimate',
    })
  }

  // ── 4) Estimated payments / safe harbor (informational) ────────────────────
  if (base.balance >= 1000) {
    moves.push({
      key: 'estimates',
      category: 'compliance',
      title: 'Cover the balance with estimates',
      detail:
        `The projection shows about ${usd(base.balance)} owed at filing. Setting aside roughly ${usd(round100(base.balance / 4))} per ` +
        `quarter and paying federal estimated taxes avoids an underpayment penalty.`,
      action: `Schedule quarterly estimated payments of ~${usd(round100(base.balance / 4))}.`,
      amount: base.balance,
      estSavings: null,
      confidence: 'estimate',
    })
  }

  // Quantified moves first (largest saving on top), informational after.
  return moves.sort((a, b) => {
    if (a.estSavings != null && b.estSavings != null) return b.estSavings - a.estSavings
    if (a.estSavings != null) return -1
    if (b.estSavings != null) return 1
    return 0
  })
}

function usd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function pctInt(n: number): string {
  return `${Math.round(n * 100)}%`
}

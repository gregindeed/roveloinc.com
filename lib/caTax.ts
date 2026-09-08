// ── California state tax estimate (Phase 4) ──────────────────────────────────
// Layers CA on top of the federal position for CA-resident individuals. CA
// taxable income starts from federal AGI less the CA standard deduction — CA
// doesn't conform to the federal QBI deduction and has no separate SE tax, so
// working from federal AGI is a sound estimate. Schedules X (single/MFS),
// Y (MFJ/QSS), and Z (HOH) are the official FTB 2024/2025 rate schedules.
// An estimate, standard-deduction only, ignoring CA exemption credits.

import type { FilingStatus, Bracket } from '@/lib/tax'

const INF = Infinity

type CaYear = {
  X: Bracket[] // single / MFS
  Y: Bracket[] // MFJ / QSS
  Z: Bracket[] // HOH
  stdSingle: number // single / MFS
  stdJoint: number // MFJ / QSS / HOH
}

const CA: Record<number, CaYear> = {
  2024: {
    X: [
      { upTo: 10756, rate: 0.01 }, { upTo: 25499, rate: 0.02 }, { upTo: 40245, rate: 0.04 },
      { upTo: 55866, rate: 0.06 }, { upTo: 70606, rate: 0.08 }, { upTo: 360659, rate: 0.093 },
      { upTo: 432787, rate: 0.103 }, { upTo: 721314, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    Y: [
      { upTo: 21512, rate: 0.01 }, { upTo: 50998, rate: 0.02 }, { upTo: 80490, rate: 0.04 },
      { upTo: 111732, rate: 0.06 }, { upTo: 141212, rate: 0.08 }, { upTo: 721318, rate: 0.093 },
      { upTo: 865574, rate: 0.103 }, { upTo: 1442628, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    Z: [
      { upTo: 21527, rate: 0.01 }, { upTo: 51000, rate: 0.02 }, { upTo: 65744, rate: 0.04 },
      { upTo: 81364, rate: 0.06 }, { upTo: 96107, rate: 0.08 }, { upTo: 490493, rate: 0.093 },
      { upTo: 588593, rate: 0.103 }, { upTo: 980987, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    stdSingle: 5540,
    stdJoint: 11080,
  },
  2025: {
    X: [
      { upTo: 11079, rate: 0.01 }, { upTo: 26264, rate: 0.02 }, { upTo: 41452, rate: 0.04 },
      { upTo: 57542, rate: 0.06 }, { upTo: 72724, rate: 0.08 }, { upTo: 371479, rate: 0.093 },
      { upTo: 445771, rate: 0.103 }, { upTo: 742953, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    Y: [
      { upTo: 22158, rate: 0.01 }, { upTo: 52528, rate: 0.02 }, { upTo: 82904, rate: 0.04 },
      { upTo: 115084, rate: 0.06 }, { upTo: 145448, rate: 0.08 }, { upTo: 742958, rate: 0.093 },
      { upTo: 891542, rate: 0.103 }, { upTo: 1485906, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    Z: [
      { upTo: 22173, rate: 0.01 }, { upTo: 52530, rate: 0.02 }, { upTo: 67716, rate: 0.04 },
      { upTo: 83805, rate: 0.06 }, { upTo: 98990, rate: 0.08 }, { upTo: 505208, rate: 0.093 },
      { upTo: 606251, rate: 0.103 }, { upTo: 1010417, rate: 0.113 }, { upTo: INF, rate: 0.123 },
    ],
    stdSingle: 5706,
    stdJoint: 11412,
  },
}

const CA_YEARS = Object.keys(CA).map(Number).sort((a, b) => a - b)

function resolveCaYear(year: number): { year: number; data: CaYear; exact: boolean } {
  if (CA[year]) return { year, data: CA[year], exact: true }
  const nearest = CA_YEARS.reduce((b, y) => (Math.abs(y - year) < Math.abs(b - year) ? y : b), CA_YEARS[0])
  return { year: nearest, data: CA[nearest], exact: false }
}

function scheduleFor(data: CaYear, fs: FilingStatus): { brackets: Bracket[]; std: number } {
  switch (fs) {
    case 'single':
    case 'mfs':
      return { brackets: data.X, std: data.stdSingle }
    case 'mfj':
    case 'qw':
      return { brackets: data.Y, std: data.stdJoint }
    case 'hoh':
      return { brackets: data.Z, std: data.stdJoint }
  }
}

const MENTAL_HEALTH_SURCHARGE = 0.01 // extra 1% on taxable income over $1,000,000
const round = (n: number) => Math.round(n)

function taxOn(amount: number, brackets: Bracket[]): number {
  let tax = 0
  let last = 0
  for (const b of brackets) {
    if (amount <= last) break
    tax += (Math.min(amount, b.upTo) - last) * b.rate
    last = b.upTo
    if (amount <= b.upTo) break
  }
  return tax
}

export type CaTaxPosition = {
  year: number
  exactYear: boolean
  filingStatus: FilingStatus
  standardDeduction: number
  taxableIncome: number
  tax: number
  marginalRate: number
  effectiveRate: number // CA tax / federal AGI
}

// Estimate CA tax from the federal AGI. Returns null-safe values; call only for
// CA residents.
export function computeCaTax(federalAgi: number, filingStatus: FilingStatus, year: number): CaTaxPosition {
  const { data, year: y, exact } = resolveCaYear(year)
  const { brackets, std } = scheduleFor(data, filingStatus)
  const taxable = Math.max(0, federalAgi - std)
  let tax = taxOn(taxable, brackets)
  if (taxable > 1_000_000) tax += (taxable - 1_000_000) * MENTAL_HEALTH_SURCHARGE

  let marginal = brackets[0].rate
  let last = 0
  for (const b of brackets) {
    if (taxable > last) marginal = b.rate
    last = b.upTo
  }
  if (taxable > 1_000_000) marginal += MENTAL_HEALTH_SURCHARGE

  return {
    year: y,
    exactYear: exact,
    filingStatus,
    standardDeduction: std,
    taxableIncome: round(taxable),
    tax: round(tax),
    marginalRate: marginal,
    effectiveRate: federalAgi > 0 ? tax / federalAgi : 0,
  }
}

// Is this client's home state California?
export function isCaResident(state: string | null | undefined): boolean {
  if (!state) return false
  const s = state.trim().toLowerCase()
  return s === 'ca' || s === 'california'
}

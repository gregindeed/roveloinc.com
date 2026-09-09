// ── Federal individual tax estimate (Phase 4, tax-position-first) ────────────
// A grounded ESTIMATE of an individual's federal position for a tax year, built
// from the structured income we capture (W-2 wages, 1099s, Schedule C net,
// dividends). Two bases are modeled:
//   • Resident (Form 1040): standard deduction, ordinary brackets, qualified
//     dividends at 0/15/20% capital-gains rates, self-employment tax, QBI.
//   • Nonresident (Form 1040-NR): no standard deduction, no QBI, no SE tax;
//     effectively-connected income at graduated rates; US-source dividends
//     (FDAP) taxed at a flat 30% or a lower tax-treaty rate.
// Every figure the UI shows is labeled an estimate — a planning tool, not a
// filed return. Bracket, deduction, wage-base, and capital-gains figures are the
// official IRS amounts for 2024, 2025, 2026 (verified against IRS / Tax Foundation).

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw'
export type Residency = 'resident' | 'nonresident'

export type Bracket = { upTo: number; rate: number } // upTo = top of this bracket (Infinity for the last)

type YearTable = {
  single: Bracket[]
  mfj: Bracket[]
  hoh: Bracket[]
  stdDeduction: Record<FilingStatus, number>
  ssWageBase: number
}

const INF = Infinity

const halve = (b: Bracket[]): Bracket[] => b.map((x) => ({ upTo: x.upTo === INF ? INF : x.upTo / 2, rate: x.rate }))

const YEARS: Record<number, YearTable> = {
  2024: {
    single: [
      { upTo: 11600, rate: 0.1 }, { upTo: 47150, rate: 0.12 }, { upTo: 100525, rate: 0.22 },
      { upTo: 191950, rate: 0.24 }, { upTo: 243725, rate: 0.32 }, { upTo: 609350, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    mfj: [
      { upTo: 23200, rate: 0.1 }, { upTo: 94300, rate: 0.12 }, { upTo: 201050, rate: 0.22 },
      { upTo: 383900, rate: 0.24 }, { upTo: 487450, rate: 0.32 }, { upTo: 731200, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    hoh: [
      { upTo: 16550, rate: 0.1 }, { upTo: 63100, rate: 0.12 }, { upTo: 100500, rate: 0.22 },
      { upTo: 191950, rate: 0.24 }, { upTo: 243700, rate: 0.32 }, { upTo: 609350, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    stdDeduction: { single: 14600, mfj: 29200, mfs: 14600, hoh: 21900, qw: 29200 },
    ssWageBase: 168600,
  },
  2025: {
    single: [
      { upTo: 11925, rate: 0.1 }, { upTo: 48475, rate: 0.12 }, { upTo: 103350, rate: 0.22 },
      { upTo: 197300, rate: 0.24 }, { upTo: 250525, rate: 0.32 }, { upTo: 626350, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    mfj: [
      { upTo: 23850, rate: 0.1 }, { upTo: 96950, rate: 0.12 }, { upTo: 206700, rate: 0.22 },
      { upTo: 394600, rate: 0.24 }, { upTo: 501050, rate: 0.32 }, { upTo: 751600, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17000, rate: 0.1 }, { upTo: 64850, rate: 0.12 }, { upTo: 103350, rate: 0.22 },
      { upTo: 197300, rate: 0.24 }, { upTo: 250500, rate: 0.32 }, { upTo: 626350, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    stdDeduction: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625, qw: 31500 },
    ssWageBase: 176100,
  },
  2026: {
    single: [
      { upTo: 12400, rate: 0.1 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
      { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    mfj: [
      { upTo: 24800, rate: 0.1 }, { upTo: 100800, rate: 0.12 }, { upTo: 211400, rate: 0.22 },
      { upTo: 403550, rate: 0.24 }, { upTo: 512450, rate: 0.32 }, { upTo: 768700, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17700, rate: 0.1 }, { upTo: 67450, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
      { upTo: 201775, rate: 0.24 }, { upTo: 256200, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: INF, rate: 0.37 },
    ],
    stdDeduction: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150, qw: 32200 },
    ssWageBase: 184500,
  },
}

// Long-term capital-gains / qualified-dividend breakpoints (by taxable income).
// upTo = top of the 0% and 15% bands; the remainder is 20%.
const LTCG: Record<number, { single: Bracket[]; mfj: Bracket[]; hoh: Bracket[] }> = {
  2024: {
    single: [{ upTo: 47025, rate: 0 }, { upTo: 518900, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    mfj: [{ upTo: 94050, rate: 0 }, { upTo: 583750, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    hoh: [{ upTo: 63000, rate: 0 }, { upTo: 551350, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
  },
  2025: {
    single: [{ upTo: 48350, rate: 0 }, { upTo: 533400, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    mfj: [{ upTo: 96700, rate: 0 }, { upTo: 600050, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    hoh: [{ upTo: 64750, rate: 0 }, { upTo: 566700, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
  },
  2026: {
    single: [{ upTo: 49450, rate: 0 }, { upTo: 545500, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    mfj: [{ upTo: 98900, rate: 0 }, { upTo: 613700, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
    hoh: [{ upTo: 66200, rate: 0 }, { upTo: 579600, rate: 0.15 }, { upTo: INF, rate: 0.2 }],
  },
}

const SUPPORTED_YEARS = Object.keys(YEARS).map(Number).sort((a, b) => a - b)

function resolveYear(year: number): { year: number; table: YearTable; exact: boolean } {
  if (YEARS[year]) return { year, table: YEARS[year], exact: true }
  const nearest = SUPPORTED_YEARS.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), SUPPORTED_YEARS[0])
  return { year: nearest, table: YEARS[nearest], exact: false }
}

function bracketsFor(table: YearTable, fs: FilingStatus): Bracket[] {
  switch (fs) {
    case 'single': return table.single
    case 'hoh': return table.hoh
    case 'mfj':
    case 'qw': return table.mfj
    case 'mfs': return halve(table.mfj)
  }
}

function ltcgFor(year: number, fs: FilingStatus): Bracket[] {
  const y = YEARS[year] ? year : resolveYear(year).year
  const set = LTCG[y]
  switch (fs) {
    case 'single': return set.single
    case 'hoh': return set.hoh
    case 'mfj':
    case 'qw': return set.mfj
    case 'mfs': return [{ upTo: set.single[0].upTo, rate: 0 }, { upTo: set.mfj[1].upTo / 2, rate: 0.15 }, { upTo: INF, rate: 0.2 }]
  }
}

const SE_NET_FACTOR = 0.9235
const SS_RATE = 0.124
const MEDICARE_RATE = 0.029
const NR_DEFAULT_FDAP_RATE = 0.3 // flat 30% on US-source FDAP when no treaty is claimed

export type TaxPositionInput = {
  year: number
  filingStatus: FilingStatus
  w2Wages: number
  w2SsWages: number
  otherIncome: number // pure ordinary 1099 (interest, NEC, etc. — no dividends/gains)
  scheduleCNet: number
  qualifiedDividends?: number // 1099-DIV qualified (e.g. C-corp distributions) → cap-gains rates
  ordinaryDividends?: number // ordinary / REIT dividends → ordinary rates (resident), FDAP (NR)
  longTermGains?: number // net long-term capital gain → cap-gains rates (resident), excluded (NR)
  shortTermGains?: number // net short-term capital gain → ordinary rates (resident), excluded (NR)
  withholding: number
  preTaxAdjustments?: number
  // Residency basis. 'nonresident' switches to 1040-NR treatment.
  residency?: Residency
  // For nonresidents: flat rate on US-source dividends (treaty rate, e.g. 0.10).
  // Null/undefined → the statutory 30%.
  treatyDividendRate?: number | null
}

export type BracketSlice = { rate: number; amount: number; tax: number }

export type TaxPosition = {
  year: number
  exactYear: boolean
  filingStatus: FilingStatus
  residency: Residency
  totalIncome: number
  qualifiedDividends: number
  dividendTax: number
  dividendRate: number | null // the flat rate applied to NR dividends (null for resident)
  seTax: number
  seTaxDeduction: number
  agi: number
  standardDeduction: number
  qbiDeduction: number
  qbiEstimated: boolean
  taxableIncome: number
  incomeTax: number // ordinary income tax (excludes SE and the dividend tax)
  totalTax: number
  withholding: number
  balance: number
  marginalRate: number
  effectiveRate: number
  slices: BracketSlice[]
  bracketTop: number | null
  roomToNextBracket: number | null
}

const round = (n: number) => Math.round(n)

function taxOn(amount: number, brackets: Bracket[]): { tax: number; slices: BracketSlice[] } {
  let tax = 0
  let last = 0
  const slices: BracketSlice[] = []
  for (const b of brackets) {
    if (amount <= last) break
    const top = Math.min(amount, b.upTo)
    const inBand = top - last
    if (inBand > 0) {
      const t = inBand * b.rate
      tax += t
      slices.push({ rate: b.rate, amount: inBand, tax: t })
    }
    last = b.upTo
    if (amount <= b.upTo) break
  }
  return { tax, slices }
}

// Tax on a qualified-dividend / LTCG amount that stacks ON TOP of `base`
// (ordinary taxable income), split across the 0/15/20 bands.
function stackedGainsTax(base: number, gain: number, br: Bracket[]): number {
  if (gain <= 0) return 0
  let tax = 0
  let prevTop = 0
  const lo = base
  const hi = base + gain
  for (const b of br) {
    const overlapLo = Math.max(lo, prevTop)
    const overlapHi = Math.min(hi, b.upTo)
    if (overlapHi > overlapLo) tax += (overlapHi - overlapLo) * b.rate
    prevTop = b.upTo
    if (hi <= b.upTo) break
  }
  return tax
}

function marginalBand(taxable: number, brackets: Bracket[]): { rate: number; top: number | null } {
  let rate = brackets[0].rate
  let top: number | null = null
  let last = 0
  for (const b of brackets) {
    if (taxable > last) {
      rate = b.rate
      top = b.upTo === INF ? null : b.upTo
    }
    last = b.upTo
  }
  return { rate, top }
}

export function computeTaxPosition(inp: TaxPositionInput): TaxPosition {
  const { table, year, exact } = resolveYear(inp.year)
  const brackets = bracketsFor(table, inp.filingStatus)
  const residency: Residency = inp.residency === 'nonresident' ? 'nonresident' : 'resident'
  const qualDiv = Math.max(0, inp.qualifiedDividends ?? 0)
  const ordDiv = Math.max(0, inp.ordinaryDividends ?? 0)
  const ltGains = Math.max(0, inp.longTermGains ?? 0)
  const stGains = Math.max(0, inp.shortTermGains ?? 0)
  const scheduleCNet = Math.max(0, inp.scheduleCNet)
  const preTax = inp.preTaxAdjustments ?? 0
  const totalIncome = inp.w2Wages + inp.otherIncome + inp.scheduleCNet + qualDiv + ordDiv + ltGains + stGains

  // ── Nonresident alien — Form 1040-NR ───────────────────────────────────────
  if (residency === 'nonresident') {
    // Effectively-connected income taxed at graduated rates, no standard
    // deduction and no QBI. Nonresident aliens aren't subject to SE tax, and
    // their capital gains on securities are generally not US-taxed (excluded).
    const eci = Math.max(0, inp.w2Wages + inp.otherIncome + inp.scheduleCNet - preTax)
    const { tax: eciTax, slices } = taxOn(eci, brackets)
    const dividendRate = inp.treatyDividendRate != null ? inp.treatyDividendRate : NR_DEFAULT_FDAP_RATE
    const fdapDividends = qualDiv + ordDiv // all US-source dividends are FDAP
    const dividendTax = fdapDividends * dividendRate
    const totalTax = eciTax + dividendTax
    const mb = marginalBand(eci, brackets)
    return {
      year, exactYear: exact, filingStatus: inp.filingStatus, residency,
      totalIncome: round(totalIncome),
      qualifiedDividends: round(fdapDividends),
      dividendTax: round(dividendTax),
      dividendRate,
      seTax: 0, seTaxDeduction: 0,
      agi: round(eci + fdapDividends),
      standardDeduction: 0,
      qbiDeduction: 0, qbiEstimated: true,
      taxableIncome: round(eci + fdapDividends),
      incomeTax: round(eciTax),
      totalTax: round(totalTax),
      withholding: round(inp.withholding),
      balance: round(totalTax - inp.withholding),
      marginalRate: eci > 0 ? mb.rate : dividendRate,
      effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
      slices: slices.map((s) => ({ rate: s.rate, amount: round(s.amount), tax: round(s.tax) })),
      bracketTop: eci > 0 ? mb.top : null,
      roomToNextBracket: eci > 0 && mb.top != null ? round(Math.max(0, mb.top - eci)) : null,
    }
  }

  // ── Resident — Form 1040 ────────────────────────────────────────────────────
  const seBase = scheduleCNet * SE_NET_FACTOR
  const ssAvailable = Math.max(0, table.ssWageBase - inp.w2SsWages)
  const seSS = Math.min(seBase, ssAvailable) * SS_RATE
  const seMedicare = seBase * MEDICARE_RATE
  const seTax = seBase > 0 ? seSS + seMedicare : 0
  const seTaxDeduction = seTax * 0.5

  const agi = Math.max(0, totalIncome - seTaxDeduction - preTax)
  const standardDeduction = table.stdDeduction[inp.filingStatus]
  const taxableBeforeQbi = Math.max(0, agi - standardDeduction)

  const qbiThreshold = brackets[3]?.upTo ?? INF
  let qbiDeduction = 0
  let qbiEstimated = true
  if (scheduleCNet > 0) {
    if (taxableBeforeQbi <= qbiThreshold) {
      const qbiBase = Math.max(0, scheduleCNet - seTaxDeduction)
      qbiDeduction = Math.min(0.2 * qbiBase, 0.2 * taxableBeforeQbi)
    } else {
      qbiEstimated = false
    }
  }

  const taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction)
  // Qualified dividends and net long-term gains inside taxable income are taxed
  // at capital-gains rates; the rest (incl. ordinary/REIT dividends and short-term
  // gains) is ordinary.
  const capGainsRateIncome = qualDiv + ltGains
  const gainsTaxable = Math.min(capGainsRateIncome, taxableIncome)
  const ordinaryTaxable = Math.max(0, taxableIncome - gainsTaxable)
  const { tax: ordinaryTax, slices } = taxOn(ordinaryTaxable, brackets)
  const dividendTax = stackedGainsTax(ordinaryTaxable, gainsTaxable, ltcgFor(year, inp.filingStatus))
  const incomeTax = ordinaryTax + dividendTax
  const totalTax = incomeTax + seTax
  const balance = totalTax - inp.withholding

  const mb = marginalBand(ordinaryTaxable, brackets)
  const roomToNextBracket = mb.top == null ? null : Math.max(0, mb.top - ordinaryTaxable)

  return {
    year, exactYear: exact, filingStatus: inp.filingStatus, residency,
    totalIncome: round(totalIncome),
    qualifiedDividends: round(gainsTaxable),
    dividendTax: round(dividendTax),
    dividendRate: null,
    seTax: round(seTax),
    seTaxDeduction: round(seTaxDeduction),
    agi: round(agi),
    standardDeduction,
    qbiDeduction: round(qbiDeduction),
    qbiEstimated,
    taxableIncome: round(taxableIncome),
    incomeTax: round(incomeTax),
    totalTax: round(totalTax),
    withholding: round(inp.withholding),
    balance: round(balance),
    marginalRate: mb.rate,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    slices: slices.map((s) => ({ rate: s.rate, amount: round(s.amount), tax: round(s.tax) })),
    bracketTop: mb.top,
    roomToNextBracket: roomToNextBracket == null ? null : round(roomToNextBracket),
  }
}

export const FILING_STATUS_SHORT: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
  qw: 'Qualifying surviving spouse',
}

export function asFilingStatus(v: unknown): FilingStatus {
  return v === 'mfj' || v === 'mfs' || v === 'hoh' || v === 'qw' ? v : 'single'
}

export function asResidency(v: unknown): Residency {
  return v === 'nonresident' ? 'nonresident' : 'resident'
}

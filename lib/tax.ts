// ── Federal individual tax estimate (Phase 4, tax-position-first) ────────────
// A grounded ESTIMATE of an individual's federal position for a tax year, built
// from the structured income we capture (W-2 wages, 1099s, Schedule C net).
// Federal only for now — CA state layers on later. Standard deduction only
// (no itemized), simplified self-employment tax and QBI. Every figure the UI
// shows is labeled an estimate; this is a planning tool, not a filed return.
//
// Bracket, standard-deduction, and Social Security wage-base figures are the
// official IRS amounts for each year (verified against Tax Foundation / IRS):
//   2024, 2025, 2026. Married-filing-separately brackets are exactly half of
//   married-filing-jointly; qualifying surviving spouse uses the MFJ tables.

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw'

export type Bracket = { upTo: number; rate: number } // upTo = top of this bracket (Infinity for the last)

type YearTable = {
  single: Bracket[]
  mfj: Bracket[]
  hoh: Bracket[]
  stdDeduction: Record<FilingStatus, number>
  ssWageBase: number
}

const INF = Infinity

// Halve every MFJ threshold to get the MFS brackets (current-law relationship).
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

const SUPPORTED_YEARS = Object.keys(YEARS).map(Number).sort((a, b) => a - b)

// Resolve a year to its table, clamping to the nearest supported year and
// reporting whether the requested year was covered exactly.
function resolveYear(year: number): { year: number; table: YearTable; exact: boolean } {
  if (YEARS[year]) return { year, table: YEARS[year], exact: true }
  const nearest = SUPPORTED_YEARS.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best), SUPPORTED_YEARS[0])
  return { year: nearest, table: YEARS[nearest], exact: false }
}

// The bracket set for a filing status (MFS = half MFJ; QW = MFJ).
function bracketsFor(table: YearTable, fs: FilingStatus): Bracket[] {
  switch (fs) {
    case 'single': return table.single
    case 'hoh': return table.hoh
    case 'mfj':
    case 'qw': return table.mfj
    case 'mfs': return halve(table.mfj)
  }
}

const SE_NET_FACTOR = 0.9235 // net earnings from self-employment = Schedule C net × 92.35%
const SS_RATE = 0.124 // Social Security portion of SE tax
const MEDICARE_RATE = 0.029 // Medicare portion of SE tax (no cap)

export type TaxPositionInput = {
  year: number
  filingStatus: FilingStatus
  w2Wages: number // Box 1 total
  w2SsWages: number // Box 3 total — reduces the SS base available for SE tax
  otherIncome: number // 1099 income treated as ordinary (estimate)
  scheduleCNet: number // net profit across Schedule C businesses
  withholding: number // W-2 Box 2 + 1099 federal withholding
  // Above-the-line adjustments beyond the ½ SE-tax deduction — e.g. modeling a
  // pre-tax retirement contribution or HSA. Reduces AGI. Used by the planner.
  preTaxAdjustments?: number
}

export type BracketSlice = { rate: number; amount: number; tax: number }

export type TaxPosition = {
  year: number
  exactYear: boolean
  filingStatus: FilingStatus
  totalIncome: number
  seTax: number
  seTaxDeduction: number // half of SE tax, above-the-line
  agi: number
  standardDeduction: number
  qbiDeduction: number
  qbiEstimated: boolean // false when income is above the simple-case threshold
  taxableIncome: number
  incomeTax: number
  totalTax: number // income tax + SE tax
  withholding: number
  balance: number // >0 = owe, <0 = refund
  marginalRate: number
  effectiveRate: number // total tax / total income
  slices: BracketSlice[] // taxable income split across the brackets it fills
  bracketTop: number | null // top of the current marginal bracket (null if top bracket)
  roomToNextBracket: number | null // taxable-income headroom before the next rate
}

const round = (n: number) => Math.round(n)

// Progressive tax on an amount given a bracket set; also returns the per-bracket slices.
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

export function computeTaxPosition(inp: TaxPositionInput): TaxPosition {
  const { table, year, exact } = resolveYear(inp.year)
  const brackets = bracketsFor(table, inp.filingStatus)

  const scheduleCNet = Math.max(0, inp.scheduleCNet)
  const totalIncome = inp.w2Wages + inp.otherIncome + inp.scheduleCNet

  // Self-employment tax on Schedule C net (simplified — ignores the 0.9% extra
  // Medicare surtax). W-2 Social Security wages consume the SS base first.
  const seBase = scheduleCNet * SE_NET_FACTOR
  const ssAvailable = Math.max(0, table.ssWageBase - inp.w2SsWages)
  const seSS = Math.min(seBase, ssAvailable) * SS_RATE
  const seMedicare = seBase * MEDICARE_RATE
  const seTax = seBase > 0 ? seSS + seMedicare : 0
  const seTaxDeduction = seTax * 0.5

  const agi = Math.max(0, totalIncome - seTaxDeduction - (inp.preTaxAdjustments ?? 0))
  const standardDeduction = table.stdDeduction[inp.filingStatus]
  const taxableBeforeQbi = Math.max(0, agi - standardDeduction)

  // Simplified §199A QBI deduction: 20% of Schedule C QBI (net of the ½ SE-tax
  // deduction), capped at 20% of taxable income. Only estimated below the top of
  // the 24% bracket, where the W-2/UBIA limits and SSTB phase-outs don't apply.
  const qbiThreshold = brackets[3]?.upTo ?? INF // top of the 24% band
  let qbiDeduction = 0
  let qbiEstimated = true
  if (scheduleCNet > 0) {
    if (taxableBeforeQbi <= qbiThreshold) {
      const qbiBase = Math.max(0, scheduleCNet - seTaxDeduction)
      qbiDeduction = Math.min(0.2 * qbiBase, 0.2 * taxableBeforeQbi)
    } else {
      qbiEstimated = false // above the simple case — we don't guess the limited amount
    }
  }

  const taxableIncome = Math.max(0, taxableBeforeQbi - qbiDeduction)
  const { tax: incomeTax, slices } = taxOn(taxableIncome, brackets)
  const totalTax = incomeTax + seTax
  const balance = totalTax - inp.withholding

  // Marginal band + headroom to the next rate.
  let marginalRate = brackets[0].rate
  let bracketTop: number | null = null
  let last = 0
  for (const b of brackets) {
    if (taxableIncome > last) {
      marginalRate = b.rate
      bracketTop = b.upTo === INF ? null : b.upTo
    }
    last = b.upTo
  }
  const roomToNextBracket = bracketTop == null ? null : Math.max(0, bracketTop - taxableIncome)

  return {
    year,
    exactYear: exact,
    filingStatus: inp.filingStatus,
    totalIncome: round(totalIncome),
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
    marginalRate,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    slices: slices.map((s) => ({ rate: s.rate, amount: round(s.amount), tax: round(s.tax) })),
    bracketTop,
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

// Normalize a stored client.filing_status into a FilingStatus (default single).
export function asFilingStatus(v: unknown): FilingStatus {
  return v === 'mfj' || v === 'mfs' || v === 'hoh' || v === 'qw' ? v : 'single'
}

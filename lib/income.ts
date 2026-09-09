// Structured personal income — the line data behind a 1040. Row shapes,
// the picklists the UI offers, and the totals the overview computes.

export type W2Income = {
  id: string
  client_id: string
  year: number
  employer_name: string
  employer_ein: string | null
  wages: number
  fed_withholding: number
  ss_wages: number | null
  ss_withholding: number | null
  medicare_wages: number | null
  medicare_withholding: number | null
  state: string | null
  state_wages: number | null
  state_withholding: number | null
  document_id: string | null
  created_at: string
}

export type Income1099 = {
  id: string
  client_id: string
  year: number
  form_type: string
  payer_name: string
  payer_tin: string | null
  amount: number
  fed_withholding: number
  description: string | null
  document_id: string | null
  created_at: string
}

export type ScheduleC = {
  id: string
  client_id: string
  year: number
  business_name: string
  principal_activity: string | null
  naics_code: string | null
  accounting_method: string | null
  gross_receipts: number
  returns_allowances: number
  cogs: number
  expenses: Record<string, number> | null
  created_at: string
}

export type ScheduleE = {
  id: string
  client_id: string
  year: number
  property_label: string
  property_type: string | null
  address: string | null
  rents_received: number
  expenses: Record<string, number> | null
  created_at: string
}

export type TaxDeductions = {
  medical: number
  state_local_taxes: number
  mortgage_interest: number
  charitable: number
  other_itemized: number
  estimated_credits: number
}

// 1099 variants we surface. `amount` is that form's headline box.
export const FORM_1099_TYPES: { value: string; label: string }[] = [
  { value: 'nec', label: '1099-NEC — Nonemployee comp' },
  { value: 'misc', label: '1099-MISC — Miscellaneous' },
  { value: 'int', label: '1099-INT — Interest' },
  { value: 'div', label: '1099-DIV — Qualified dividends' },
  { value: 'divord', label: '1099-DIV — Ordinary / REIT dividends' },
  { value: 'ltcg', label: 'Capital gain — long-term' },
  { value: 'stcg', label: 'Capital gain — short-term' },
  { value: 'k', label: '1099-K — Card / third-party' },
  { value: 'g', label: '1099-G — Government payments' },
  { value: 'r', label: '1099-R — Retirement' },
  { value: 'b', label: '1099-B — Broker proceeds' },
  { value: 'ssa', label: 'SSA-1099 — Social Security' },
  { value: 'other', label: 'Other' },
]

export const FORM_1099_LABEL: Record<string, string> = Object.fromEntries(
  FORM_1099_TYPES.map((t) => [t.value, t.label])
)

export function form1099Short(type: string): string {
  const map: Record<string, string> = {
    nec: '1099-NEC',
    misc: '1099-MISC',
    int: '1099-INT',
    div: '1099-DIV',
    divord: '1099-DIV',
    ltcg: 'LT gain',
    stcg: 'ST gain',
    k: '1099-K',
    g: '1099-G',
    r: '1099-R',
    b: '1099-B',
    ssa: 'SSA-1099',
    other: '1099',
  }
  return map[type] ?? '1099'
}

// Schedule C Part II expense line categories.
export const SCHEDULE_C_EXPENSES: { key: string; label: string }[] = [
  { key: 'advertising', label: 'Advertising' },
  { key: 'car', label: 'Car & truck' },
  { key: 'commissions', label: 'Commissions & fees' },
  { key: 'contract_labor', label: 'Contract labor' },
  { key: 'depreciation', label: 'Depreciation' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'interest', label: 'Interest' },
  { key: 'legal', label: 'Legal & professional' },
  { key: 'office', label: 'Office expense' },
  { key: 'rent', label: 'Rent / lease' },
  { key: 'repairs', label: 'Repairs & maintenance' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'taxes_licenses', label: 'Taxes & licenses' },
  { key: 'travel', label: 'Travel' },
  { key: 'meals', label: 'Meals' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'wages', label: 'Wages' },
  { key: 'home_office', label: 'Home office' },
  { key: 'other', label: 'Other expenses' },
]

export const SCHEDULE_C_EXPENSE_LABEL: Record<string, string> = Object.fromEntries(
  SCHEDULE_C_EXPENSES.map((e) => [e.key, e.label])
)

function sumExpenses(expenses: Record<string, number> | null | undefined): number {
  if (!expenses) return 0
  return Object.values(expenses).reduce((a, b) => a + (Number(b) || 0), 0)
}

// Net profit for a single Schedule C business.
export function scheduleCNet(sc: ScheduleC): number {
  return (
    (sc.gross_receipts || 0) -
    (sc.returns_allowances || 0) -
    (sc.cogs || 0) -
    sumExpenses(sc.expenses)
  )
}

// Schedule E rental / royalty expense line categories.
export const SCHEDULE_E_EXPENSES: { key: string; label: string }[] = [
  { key: 'advertising', label: 'Advertising' },
  { key: 'auto_travel', label: 'Auto & travel' },
  { key: 'cleaning', label: 'Cleaning & maintenance' },
  { key: 'commissions', label: 'Commissions' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'legal', label: 'Legal & professional' },
  { key: 'management', label: 'Management fees' },
  { key: 'mortgage_interest', label: 'Mortgage interest' },
  { key: 'other_interest', label: 'Other interest' },
  { key: 'repairs', label: 'Repairs' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'depreciation', label: 'Depreciation' },
  { key: 'other', label: 'Other expenses' },
]

export const SCHEDULE_E_EXPENSE_LABEL: Record<string, string> = Object.fromEntries(
  SCHEDULE_E_EXPENSES.map((e) => [e.key, e.label])
)

export const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land' },
  { value: 'royalty', label: 'Royalty' },
  { value: 'other', label: 'Other' },
]

// Net rental income for a single property (can be a loss).
export function scheduleENet(se: ScheduleE): number {
  return (se.rents_received || 0) - sumExpenses(se.expenses)
}

export type IncomeTotals = {
  w2Wages: number
  w2Withholding: number
  f1099Total: number
  f1099Withholding: number
  f1099ByType: { type: string; label: string; amount: number }[]
  // Investment income broken out — each gets its own tax treatment:
  //   dividends (qualified) + longTermGains → capital-gains rates (or FDAP for NR)
  //   ordinaryDividends + shortTermGains    → ordinary rates
  dividends: number // qualified dividends (1099-DIV)
  ordinaryDividends: number // ordinary / REIT dividends
  longTermGains: number // net long-term capital gain
  shortTermGains: number // net short-term capital gain
  // Pure ordinary 1099 income — everything except the four investment buckets
  // above (interest, NEC, MISC, K, G, R, B, SSA, other).
  f1099Ordinary: number
  scheduleCGross: number
  scheduleCNet: number
  // Net rental / royalty income across Schedule E properties (can be negative).
  scheduleENet: number
  totalWithholding: number
  // Total income = wages + 1099s + Schedule C net + Schedule E net.
  totalIncome: number
}

export function computeIncome(
  w2: W2Income[],
  f1099: Income1099[],
  scheduleC: ScheduleC[],
  scheduleE: ScheduleE[] = []
): IncomeTotals {
  const w2Wages = w2.reduce((a, r) => a + (r.wages || 0), 0)
  const w2Withholding = w2.reduce((a, r) => a + (r.fed_withholding || 0), 0)

  const f1099Total = f1099.reduce((a, r) => a + (r.amount || 0), 0)
  const f1099Withholding = f1099.reduce((a, r) => a + (r.fed_withholding || 0), 0)
  const sumType = (t: string) => f1099.filter((r) => r.form_type === t).reduce((a, r) => a + (r.amount || 0), 0)
  const dividends = sumType('div') // qualified
  const ordinaryDividends = sumType('divord')
  const longTermGains = sumType('ltcg')
  const shortTermGains = sumType('stcg')
  // Pure ordinary 1099 = total minus the four specially-treated investment buckets.
  const f1099Ordinary = f1099Total - dividends - ordinaryDividends - longTermGains - shortTermGains
  const byType = new Map<string, number>()
  for (const r of f1099) byType.set(r.form_type, (byType.get(r.form_type) ?? 0) + (r.amount || 0))
  const f1099ByType = Array.from(byType.entries())
    .map(([type, amount]) => ({ type, label: form1099Short(type), amount }))
    .sort((a, b) => b.amount - a.amount)

  const scheduleCGross = scheduleC.reduce((a, r) => a + (r.gross_receipts || 0), 0)
  const scheduleCNetTotal = scheduleC.reduce((a, r) => a + scheduleCNet(r), 0)
  const scheduleENetTotal = scheduleE.reduce((a, r) => a + scheduleENet(r), 0)

  return {
    w2Wages,
    w2Withholding,
    f1099Total,
    f1099Withholding,
    f1099ByType,
    dividends,
    ordinaryDividends,
    longTermGains,
    shortTermGains,
    f1099Ordinary,
    scheduleCGross,
    scheduleCNet: scheduleCNetTotal,
    scheduleENet: scheduleENetTotal,
    totalWithholding: w2Withholding + f1099Withholding,
    totalIncome: w2Wages + f1099Total + scheduleCNetTotal + scheduleENetTotal,
  }
}

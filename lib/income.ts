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

// 1099 variants we surface. `amount` is that form's headline box.
export const FORM_1099_TYPES: { value: string; label: string }[] = [
  { value: 'nec', label: '1099-NEC — Nonemployee comp' },
  { value: 'misc', label: '1099-MISC — Miscellaneous' },
  { value: 'int', label: '1099-INT — Interest' },
  { value: 'div', label: '1099-DIV — Dividends' },
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

export type IncomeTotals = {
  w2Wages: number
  w2Withholding: number
  f1099Total: number
  f1099Withholding: number
  f1099ByType: { type: string; label: string; amount: number }[]
  // Dividends (1099-DIV) — separated out because they get capital-gains /
  // treaty treatment rather than ordinary rates.
  dividends: number
  // Ordinary 1099 income = f1099Total minus dividends.
  f1099Ordinary: number
  scheduleCGross: number
  scheduleCNet: number
  totalWithholding: number
  // Total income = W-2 wages + all 1099 amounts + net Schedule C profit.
  totalIncome: number
}

export function computeIncome(
  w2: W2Income[],
  f1099: Income1099[],
  scheduleC: ScheduleC[]
): IncomeTotals {
  const w2Wages = w2.reduce((a, r) => a + (r.wages || 0), 0)
  const w2Withholding = w2.reduce((a, r) => a + (r.fed_withholding || 0), 0)

  const f1099Total = f1099.reduce((a, r) => a + (r.amount || 0), 0)
  const f1099Withholding = f1099.reduce((a, r) => a + (r.fed_withholding || 0), 0)
  const dividends = f1099.filter((r) => r.form_type === 'div').reduce((a, r) => a + (r.amount || 0), 0)
  const f1099Ordinary = f1099Total - dividends
  const byType = new Map<string, number>()
  for (const r of f1099) byType.set(r.form_type, (byType.get(r.form_type) ?? 0) + (r.amount || 0))
  const f1099ByType = Array.from(byType.entries())
    .map(([type, amount]) => ({ type, label: form1099Short(type), amount }))
    .sort((a, b) => b.amount - a.amount)

  const scheduleCGross = scheduleC.reduce((a, r) => a + (r.gross_receipts || 0), 0)
  const scheduleCNetTotal = scheduleC.reduce((a, r) => a + scheduleCNet(r), 0)

  return {
    w2Wages,
    w2Withholding,
    f1099Total,
    f1099Withholding,
    f1099ByType,
    dividends,
    f1099Ordinary,
    scheduleCGross,
    scheduleCNet: scheduleCNetTotal,
    totalWithholding: w2Withholding + f1099Withholding,
    totalIncome: w2Wages + f1099Total + scheduleCNetTotal,
  }
}

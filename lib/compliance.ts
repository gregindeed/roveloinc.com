import type { GovAgency, ObligationFrequency } from '@/lib/types'

export type GeneratedEvent = {
  period_label: string
  due_date: string // YYYY-MM-DD
  amount_due: number | null
}

export type GenOptions = {
  amount: number | null
  formationMonth: number | null // 1-12
  isLLC: boolean
}

export type ComplianceTemplate = {
  key: string
  agency: GovAgency
  label: string
  frequency: ObligationFrequency
  hint?: string
  generate: (year: number, opts: GenOptions) => GeneratedEvent[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const D = (y: number, m: number, day: number) => `${y}-${pad(m)}-${pad(day)}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

// Quarterly filing due dates: Apr 30 / Jul 31 / Oct 31 / Jan 31 (next year).
function quarterlyFilings(year: number, amount: number | null): GeneratedEvent[] {
  return [
    { period_label: `Q1 ${year}`, due_date: D(year, 4, 30), amount_due: amount },
    { period_label: `Q2 ${year}`, due_date: D(year, 7, 31), amount_due: amount },
    { period_label: `Q3 ${year}`, due_date: D(year, 10, 31), amount_due: amount },
    { period_label: `Q4 ${year}`, due_date: D(year + 1, 1, 31), amount_due: amount },
  ]
}

export const TEMPLATES: ComplianceTemplate[] = [
  {
    key: 'cdtfa_prepayment',
    agency: 'cdtfa',
    label: 'CDTFA Sales Tax — Prepayment plan',
    frequency: 'prepayment',
    hint: 'Two monthly prepayments (24th) + a quarterly return',
    generate: (year, { amount }) => {
      const out: GeneratedEvent[] = []
      ;[1, 4, 7, 10].forEach((m, qi) => {
        out.push({ period_label: `${MONTHS[m - 1]} ${year} prepay`, due_date: D(year, m + 1, 24), amount_due: amount })
        out.push({ period_label: `${MONTHS[m]} ${year} prepay`, due_date: D(year, m + 2, 24), amount_due: amount })
        const ret = qi < 3 ? D(year, m + 3, lastDay(year, m + 3)) : D(year + 1, 1, 31)
        out.push({ period_label: `Q${qi + 1} ${year} return`, due_date: ret, amount_due: null })
      })
      return out
    },
  },
  {
    key: 'cdtfa_return',
    agency: 'cdtfa',
    label: 'CDTFA Sales Tax — Quarterly return',
    frequency: 'quarterly',
    generate: (year, { amount }) => quarterlyFilings(year, amount),
  },
  {
    key: 'ftb_franchise_tax',
    agency: 'ftb',
    label: 'FTB Annual/Franchise Tax ($800 min)',
    frequency: 'annual',
    generate: (year, { amount }) => [
      { period_label: `${year} Annual Tax`, due_date: D(year, 4, 15), amount_due: amount ?? 800 },
    ],
  },
  {
    key: 'ftb_estimated',
    agency: 'ftb',
    label: 'FTB Estimated payments (corp)',
    frequency: 'quarterly',
    generate: (year, { amount }) => [
      { period_label: `Q1 ${year}`, due_date: D(year, 4, 15), amount_due: amount },
      { period_label: `Q2 ${year}`, due_date: D(year, 6, 15), amount_due: amount },
      { period_label: `Q3 ${year}`, due_date: D(year, 9, 15), amount_due: amount },
      { period_label: `Q4 ${year}`, due_date: D(year, 12, 15), amount_due: amount },
    ],
  },
  {
    key: 'edd_de9',
    agency: 'edd',
    label: 'EDD DE-9 / DE-9C payroll',
    frequency: 'quarterly',
    generate: (year, { amount }) => quarterlyFilings(year, amount),
  },
  {
    key: 'irs_941',
    agency: 'irs',
    label: 'IRS Form 941 payroll',
    frequency: 'quarterly',
    generate: (year, { amount }) => quarterlyFilings(year, amount),
  },
  {
    key: 'irs_940',
    agency: 'irs',
    label: 'IRS Form 940 (FUTA)',
    frequency: 'annual',
    generate: (year, { amount }) => [
      { period_label: `${year} FUTA`, due_date: D(year + 1, 1, 31), amount_due: amount },
    ],
  },
  {
    key: 'sos_soi',
    agency: 'sos',
    label: 'CA SOS Statement of Information',
    frequency: 'annual',
    hint: 'Due end of the anniversary month',
    generate: (year, { amount, formationMonth, isLLC }) => {
      const m = formationMonth ?? 12
      return [
        {
          period_label: `${year} Statement of Information${isLLC ? ' (biennial)' : ''}`,
          due_date: D(year, m, lastDay(year, m)),
          amount_due: amount,
        },
      ]
    },
  },
  {
    key: 'business_license',
    agency: 'city',
    label: 'Business license renewal',
    frequency: 'annual',
    hint: 'Annual — due end of the anniversary month by default',
    generate: (year, { amount, formationMonth }) => {
      const m = formationMonth ?? 12
      return [{ period_label: `${year} License renewal`, due_date: D(year, m, lastDay(year, m)), amount_due: amount }]
    },
  },
]

export function getTemplate(key: string): ComplianceTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key)
}

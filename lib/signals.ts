// ── Signal detectors (pure) ──────────────────────────────────────────────────
// Recognize what a transaction implies about the business: a tax payment to a
// specific agency, a payroll run, a sales-tax remittance. Kept pure and
// pattern-based so it's testable and inspectable; the DB side (persist, match
// obligations, raise proposals) lives in lib/signalsServer.ts.

export type TxnInput = {
  source_table: 'deposits' | 'checking_expenses' | 'cc_transactions'
  source_id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number
  direction: 'in' | 'out'
}

export type SignalType = 'payroll_evidence' | 'sales_tax_evidence' | 'tax_payment'
export type Agency = 'cdtfa' | 'ftb' | 'edd' | 'irs'

export type Candidate = {
  type: SignalType
  agency: Agency | null
  summary: string
  confidence: number
  source_table: TxnInput['source_table']
  source_id: string
  amount: number
  txn_date: string
  direction: 'in' | 'out'
  // The compliance profile field this transaction is evidence for, if any.
  proposesField: 'has_employees' | 'collects_sales_tax' | 'files_franchise_tax' | null
  // True ONLY for a genuine payment made directly TO a tax agency — the kind that
  // may auto-satisfy an obligation event. Payments to a payroll PROVIDER (ADP,
  // Gusto, …) are evidence of employees but are NOT a filing/remittance, so they
  // are provider-only: they raise a proposal but must never clear an obligation.
  satisfiesObligation: boolean
}

// Agency payment recognizers. Order matters — more specific first.
const RECOGNIZERS: {
  agency: Agency
  re: RegExp
  payroll?: boolean
  salesTax?: boolean
  // Recognizes a third-party payroll PROVIDER, not a payment to the agency. Such
  // a hit implies employees (proposal) but is never a tax remittance (no satisfy).
  providerOnly?: boolean
  confidence: number
  label: string
}[] = [
  // Payroll providers (imply employees; the payment is to a provider, not the agency)
  { agency: 'edd', providerOnly: true, re: /\bADP\b|\bGUSTO\b|\bPAYCHEX\b|INTUIT.*PAYROLL|QUICKBOOKS.*PAYROLL|\bPAYROLL\b|WAGE\s*PAY|\bTRINET\b|\bJUSTWORKS\b/i, payroll: true, confidence: 0.7, label: 'Payroll activity' },
  // EDD (CA payroll tax)
  { agency: 'edd', re: /\bEDD\b|EMPLOYMENT\s*DEV|\bDE-?9\b|UI\/ETT|\bSDI\b|CA\s*EMPLOY/i, payroll: true, confidence: 0.85, label: 'EDD payroll tax' },
  // CDTFA (sales & use tax)
  { agency: 'cdtfa', re: /\bCDTFA\b|BOARD\s*OF\s*EQUAL|\bBOE\b|SALES\s*(AND|&)?\s*USE\s*TAX|CA\s*DEPT.*TAX.*FEE/i, salesTax: true, confidence: 0.85, label: 'CDTFA sales-tax remittance' },
  // FTB (franchise / income tax)
  { agency: 'ftb', re: /\bFTB\b|FRANCHISE\s*TAX|CALIF.*FRANCHISE|CA\s*FRANCHISE/i, confidence: 0.85, label: 'FTB franchise/income tax' },
  // IRS / federal (EFTPS covers payroll 941 + income)
  { agency: 'irs', re: /\bIRS\b|\bEFTPS\b|US\s*TREASURY|UNITED\s*STATES\s*TREAS|\b941\b|\b940\b|FEDERAL\s*TAX/i, confidence: 0.75, label: 'Federal tax payment' },
]

const round2 = (n: number) => Math.round(n * 100) / 100

// Produce at most one signal candidate per transaction (first recognizer wins).
export function detectTransaction(t: TxnInput): Candidate | null {
  const desc = t.description || ''
  for (const r of RECOGNIZERS) {
    if (!r.re.test(desc)) continue

    // 941/940 or EFTPS with payroll cues → treat as payroll for the proposal.
    const payrollish = r.payroll || (r.agency === 'irs' && /\b94[01]\b|PAYROLL|WAGE/i.test(desc))

    let type: SignalType
    let proposesField: Candidate['proposesField'] = null
    if (r.salesTax) {
      type = 'sales_tax_evidence'
      proposesField = 'collects_sales_tax'
    } else if (payrollish) {
      type = 'payroll_evidence'
      proposesField = 'has_employees'
    } else {
      type = 'tax_payment'
      if (r.agency === 'ftb') proposesField = 'files_franchise_tax'
    }

    // A payroll-provider hit is evidence of employees, not a remittance to an
    // agency — so it carries no agency and can never satisfy an obligation. Only
    // a direct-to-agency payment (EDD/CDTFA/FTB/IRS) is satisfy-eligible.
    const agency = r.providerOnly ? null : r.agency
    const satisfiesObligation = !r.providerOnly && !!r.agency

    return {
      type,
      agency,
      summary: `${r.label}: “${desc.slice(0, 60)}” (${t.date})`,
      confidence: r.confidence,
      source_table: t.source_table,
      source_id: t.source_id,
      amount: round2(Math.abs(t.amount)),
      txn_date: t.date,
      direction: t.direction,
      proposesField,
      satisfiesObligation,
    }
  }
  return null
}

export function detectTransactions(txns: TxnInput[]): Candidate[] {
  const out: Candidate[] = []
  for (const t of txns) {
    const c = detectTransaction(t)
    if (c) out.push(c)
  }
  return out
}

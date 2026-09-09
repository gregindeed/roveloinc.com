// ── Onboarding question engine (pure, client + server safe) ──────────────────
// The interview is data, not a prompt: a registry of questions, each with the
// stage it belongs to, how it renders, and (optionally) when it applies. The
// next question is a PURE function of the facts gathered so far, so the flow is
// deterministic and testable — the AI layer (added next) only fills the soft
// parts (option chips, free-text → fact, reactions, doc extraction), never the
// selection itself.

import { ENTITY_TYPE_LABELS, FILING_STATUS_LABELS, type EntityType } from '@/lib/types'

const INCOME_SOURCE_LABELS: Record<string, string> = {
  w2: 'W-2 employment',
  self: 'Self-employment',
  investments: 'Dividends / investments',
  both: 'W-2 and self-employment',
  other: 'Other / not sure',
}

export type FactMap = Record<string, unknown>

// `value` is always a CORE entity type the compliance/chart engine understands;
// `subtype` (when present) is the specific human label we also record so the
// record and the Overseer's read reflect exactly what was chosen.
export type QOption = { value: string; label: string; hint?: string; subtype?: string }
export type QInput = 'chips' | 'chips_or_text' | 'text' | 'owners' | 'date'
export type Stage = 'identity' | 'operations' | 'accounting'

export type Question = {
  key: string
  stage: Stage
  prompt: string // may contain {name}
  help?: string
  input: QInput
  options?: QOption[]
  // Revealed behind a "More options" toggle — the fuller taxonomy.
  moreOptions?: QOption[]
  optional?: boolean
  appliesWhen?: (f: FactMap) => boolean
}

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'operations', label: 'Operations' },
  { key: 'accounting', label: 'Accounting' },
]

const ENTITY_OPTIONS: QOption[] = (Object.keys(ENTITY_TYPE_LABELS) as EntityType[])
  .filter((k) => k !== 'other')
  .map((k) => ({ value: k, label: ENTITY_TYPE_LABELS[k] }))

// The fuller taxonomy behind "More options". Each maps to a core type the system
// acts on, while carrying the specific subtype label for the record.
const MORE_ENTITY_OPTIONS: QOption[] = [
  { value: 'partnership', label: 'General Partnership (GP)', subtype: 'General Partnership (GP)' },
  { value: 'partnership', label: 'Limited Partnership (LP)', subtype: 'Limited Partnership (LP)' },
  { value: 'partnership', label: 'Limited Liability Partnership (LLP)', subtype: 'Limited Liability Partnership (LLP)' },
  { value: 'other', label: 'Trust / Estate', subtype: 'Trust / Estate' },
  { value: 'other', label: 'Cooperative', subtype: 'Cooperative' },
  { value: 'other', label: 'Government / Public Entity', subtype: 'Government / Public Entity' },
  { value: 'other', label: 'Other', subtype: 'Other' },
]

// Business-only vs individual-only predicates. An account is an individual (a
// 1040 filer) when account_kind === 'individual'; everything else is a business.
const isBiz = (f: FactMap) => f.account_kind !== 'individual'
const isIndiv = (f: FactMap) => f.account_kind === 'individual'

// V1 question set — the scoped vertical slice. Order here is the flow order;
// nextQuestion() skips any whose appliesWhen() is false, so the business and
// individual paths interleave into two coherent interviews.
export const QUESTIONS: Question[] = [
  {
    key: 'account_kind',
    stage: 'identity',
    prompt: 'Is {name} a business or an individual?',
    help: 'A business gets books and a chart of accounts. An individual is a 1040 filer — W-2, 1099, Schedule C.',
    input: 'chips',
    options: [
      { value: 'business', label: 'Business', hint: 'LLC, corporation, partnership — has its own books' },
      { value: 'individual', label: 'Individual', hint: 'A person / 1040 filer' },
    ],
  },
  {
    key: 'entity_type',
    stage: 'identity',
    prompt: 'What kind of entity is {name}?',
    input: 'chips_or_text',
    options: ENTITY_OPTIONS,
    moreOptions: MORE_ENTITY_OPTIONS,
    appliesWhen: isBiz,
  },
  {
    key: 'filing_status',
    stage: 'identity',
    prompt: "What is {name}'s filing status?",
    help: 'How they file their 1040. You can change it later.',
    input: 'chips',
    appliesWhen: isIndiv,
    options: [
      { value: 'single', label: 'Single' },
      { value: 'mfj', label: 'Married filing jointly' },
      { value: 'mfs', label: 'Married filing separately' },
      { value: 'hoh', label: 'Head of household' },
      { value: 'qw', label: 'Qualifying widow(er)' },
    ],
  },
  {
    key: 'state',
    stage: 'identity',
    prompt: 'Where is {name} based?',
    help: 'This tells me which state agencies and filings apply.',
    input: 'chips_or_text',
    options: [
      { value: 'CA', label: 'California' },
      { value: 'NV', label: 'Nevada' },
      { value: 'AZ', label: 'Arizona' },
      { value: 'TX', label: 'Texas' },
    ],
  },
  {
    key: 'formation_date',
    stage: 'identity',
    prompt: 'When did {name} start?',
    help: 'Formation or first-day-of-business date. It sets the first filing periods — leave it blank if unsure.',
    input: 'date',
    optional: true,
    appliesWhen: isBiz,
  },
  {
    key: 'owners',
    stage: 'identity',
    prompt: 'Who owns {name}?',
    help: 'Add each owner and their ownership %. You can leave the % blank if unsure.',
    input: 'owners',
    appliesWhen: isBiz,
  },
  {
    key: 'occupation',
    stage: 'operations',
    prompt: 'What does {name} do for work?',
    help: 'Their occupation or main line of work — optional.',
    input: 'text',
    optional: true,
    appliesWhen: isIndiv,
  },
  {
    key: 'business_activity',
    stage: 'operations',
    prompt: 'What does {name} do?',
    help: 'A short description of the business or its industry.',
    input: 'text',
    appliesWhen: isBiz,
  },
  {
    key: 'income_sources',
    stage: 'operations',
    prompt: "Where does {name}'s income come from?",
    help: 'Sets up the right income sections — refine anytime on the Income tab.',
    input: 'chips',
    appliesWhen: isIndiv,
    options: [
      { value: 'w2', label: 'W-2 employment' },
      { value: 'self', label: 'Self-employment', hint: '1099 / Schedule C' },
      { value: 'investments', label: 'Dividends / investments', hint: 'dividends, interest, capital gains' },
      { value: 'both', label: 'Both W-2 and self-employment' },
      { value: 'other', label: 'Other / not sure' },
    ],
  },
  {
    key: 'has_employees',
    stage: 'operations',
    prompt: 'Does {name} have employees?',
    help: 'This determines payroll and employer filings (EDD, IRS 941 / 940).',
    input: 'chips',
    appliesWhen: isBiz,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'not_yet', label: 'Not yet' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'accounting_basis',
    stage: 'accounting',
    prompt: 'How should we keep the books?',
    input: 'chips',
    appliesWhen: isBiz,
    options: [
      { value: 'cash', label: 'Cash', hint: 'Counted when money moves — recommended for most' },
      { value: 'accrual', label: 'Accrual', hint: 'Counted when earned / incurred' },
    ],
  },
  {
    key: 'accounting_system',
    stage: 'accounting',
    prompt: 'What are they using for accounting today?',
    help: 'Optional — helps me plan the migration and chart of accounts.',
    input: 'chips_or_text',
    optional: true,
    appliesWhen: isBiz,
    options: [
      { value: 'quickbooks', label: 'QuickBooks Online' },
      { value: 'xero', label: 'Xero' },
      { value: 'spreadsheets', label: 'Spreadsheets' },
      { value: 'none', label: 'Nothing yet' },
    ],
  },
  {
    key: 'tax_year',
    stage: 'accounting',
    prompt: 'Which tax year are we opening for {name}?',
    help: 'You can open more years later — each year is worked and closed on its own.',
    input: 'chips_or_text',
    options: (() => {
      const now = new Date().getFullYear()
      return [now, now - 1, now - 2].map((y) => ({ value: String(y), label: String(y) }))
    })(),
  },
]

// Answered once a value has been recorded — including a deliberate skip (null)
// on an optional question, so the interview advances instead of re-asking.
const answered = (f: FactMap, key: string) => f[key] !== undefined

// The next best question given what we know — or null when the interview is done.
export function nextQuestion(f: FactMap): Question | null {
  for (const q of QUESTIONS) {
    if (answered(f, q.key)) continue
    if (q.appliesWhen && !q.appliesWhen(f)) continue
    return q
  }
  return null
}

export function isComplete(f: FactMap): boolean {
  return nextQuestion(f) === null
}

export type Owner = { name: string; pct: number | null }

export function normalizeEntityType(v: unknown): EntityType | null {
  if (typeof v !== 'string' || !v) return null
  return (v in ENTITY_TYPE_LABELS ? (v as EntityType) : 'other')
}

// A one-line human summary of a fact for the review screen.
export function factSummary(key: string, value: unknown): string | null {
  switch (key) {
    case 'account_kind':
      return value === 'individual' ? 'Individual' : 'Business'
    case 'filing_status':
      return typeof value === 'string' && value ? FILING_STATUS_LABELS[value] ?? value : null
    case 'occupation':
      return typeof value === 'string' && value ? value : null
    case 'income_sources':
      return typeof value === 'string' && value ? INCOME_SOURCE_LABELS[value] ?? value : null
    case 'entity_type': {
      const t = normalizeEntityType(value)
      return t ? ENTITY_TYPE_LABELS[t] : String(value)
    }
    case 'entity_subtype':
      return typeof value === 'string' && value ? value : null
    case 'state':
      return typeof value === 'string' ? value : null
    case 'formation_date':
      return typeof value === 'string' && value ? value : null
    case 'owners': {
      const os = (value as Owner[]) ?? []
      return os.length ? os.map((o) => (o.pct != null ? `${o.name} (${o.pct}%)` : o.name)).join(', ') : null
    }
    case 'business_activity':
      return typeof value === 'string' ? value : null
    case 'has_employees':
      return value === 'yes' ? 'Has employees' : value === 'no' ? 'No employees' : value === 'not_yet' ? 'No employees yet' : 'Employees: not sure'
    case 'accounting_basis':
      return value === 'accrual' ? 'Accrual basis' : 'Cash basis'
    case 'accounting_system':
      return typeof value === 'string' ? value : null
    case 'tax_year':
      return typeof value === 'string' && value ? value : null
    default:
      return value == null ? null : String(value)
  }
}

export const STAGE_LABELS: Record<string, string> = {
  account_kind: 'Identity',
  filing_status: 'Identity',
  occupation: 'Operations',
  income_sources: 'Operations',
  entity_type: 'Identity',
  entity_subtype: 'Identity',
  state: 'Identity',
  formation_date: 'Identity',
  owners: 'Identity',
  business_activity: 'Operations',
  has_employees: 'Operations',
  accounting_basis: 'Accounting',
  accounting_system: 'Accounting',
  tax_year: 'Accounting',
}

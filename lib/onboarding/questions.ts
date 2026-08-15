// ── Onboarding question engine (pure, client + server safe) ──────────────────
// The interview is data, not a prompt: a registry of questions, each with the
// stage it belongs to, how it renders, and (optionally) when it applies. The
// next question is a PURE function of the facts gathered so far, so the flow is
// deterministic and testable — the AI layer (added next) only fills the soft
// parts (option chips, free-text → fact, reactions, doc extraction), never the
// selection itself.

import { ENTITY_TYPE_LABELS, type EntityType } from '@/lib/types'

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

// V1 question set — the scoped vertical slice. Order here is the flow order.
export const QUESTIONS: Question[] = [
  {
    key: 'entity_type',
    stage: 'identity',
    prompt: 'What kind of entity is {name}?',
    input: 'chips_or_text',
    options: ENTITY_OPTIONS,
    moreOptions: MORE_ENTITY_OPTIONS,
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
  },
  {
    key: 'owners',
    stage: 'identity',
    prompt: 'Who owns {name}?',
    help: 'Add each owner and their ownership %. You can leave the % blank if unsure.',
    input: 'owners',
  },
  {
    key: 'business_activity',
    stage: 'operations',
    prompt: 'What does {name} do?',
    help: 'A short description of the business or its industry.',
    input: 'text',
  },
  {
    key: 'has_employees',
    stage: 'operations',
    prompt: 'Does {name} have employees?',
    help: 'This determines payroll and employer filings (EDD, IRS 941 / 940).',
    input: 'chips',
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
    options: [
      { value: 'quickbooks', label: 'QuickBooks Online' },
      { value: 'xero', label: 'Xero' },
      { value: 'spreadsheets', label: 'Spreadsheets' },
      { value: 'none', label: 'Nothing yet' },
    ],
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
    default:
      return value == null ? null : String(value)
  }
}

export const STAGE_LABELS: Record<string, string> = {
  entity_type: 'Identity',
  entity_subtype: 'Identity',
  state: 'Identity',
  formation_date: 'Identity',
  owners: 'Identity',
  business_activity: 'Operations',
  has_employees: 'Operations',
  accounting_basis: 'Accounting',
  accounting_system: 'Accounting',
}

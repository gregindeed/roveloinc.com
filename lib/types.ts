export type EntityType =
  | 'sole_prop'
  | 'partnership'
  | 'llc'
  | 's_corp'
  | 'c_corp'
  | 'nonprofit'
  | 'other'

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  sole_prop: 'Sole Proprietor',
  partnership: 'Partnership',
  llc: 'LLC',
  s_corp: 'S-Corporation',
  c_corp: 'C-Corporation',
  nonprofit: 'Nonprofit',
  other: 'Other',
}

export type Client = {
  id: string
  slug: string
  org_id: string | null
  name: string
  legal_name: string | null
  owner_name: string | null
  address: string | null
  entity_type: EntityType | null
  ein: string | null
  ca_sos_number: string | null
  cdtfa_account: string | null
  edd_account: string | null
  ftb_id: string | null
  formation_date: string | null
  fiscal_year_end: string | null
  naics_code: string | null
  phone: string | null
  email: string | null
  status: string | null
  archived_at: string | null
  dissolved_date: string | null
  notes: string | null
  dba: string | null
  website: string | null
  mailing_address: string | null
  registered_agent: string | null
  registered_agent_address: string | null
  accounting_method: string | null
  employee_count: number | null
  overseer_context: string | null
  // How this entity records revenue: 'simple' (bank deposits are the record) or
  // 'sales' (a sales journal reconciles a register/POS to the bank). Default 'simple'.
  income_model?: 'simple' | 'sales' | null
  collects_sales_tax?: boolean | null
  has_employees?: boolean | null
  files_franchise_tax?: boolean | null
  files_soi?: boolean | null
  has_city_license?: boolean | null
}

export type Account = {
  id: string
  client_id: string
  code: string
  name: string
  type: 'income' | 'cogs' | 'expense' | 'asset' | 'liability' | 'equity'
  tax_line: string | null
  active: boolean
  sort: number
  created_at: string
}

export type Organization = {
  id: string
  name: string
  slug: string | null
  is_platform: boolean
  notes: string | null
  created_at: string
}

export type StatementImportRow = {
  id: string
  client_id: string
  filename: string | null
  statement_type: string | null
  period_start: string | null
  period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  total_in: number | null
  total_out: number | null
  inserted_count: number | null
  reconciled: boolean | null
  difference: number | null
  created_at: string
}

export type Officer = {
  id: string
  client_id: string
  name: string
  title: string | null
  ownership_pct: number | null
  email: string | null
  phone: string | null
  created_at: string
}

export type Deposit = {
  id: number
  txn_date: string
  description: string
  type: string | null
  category: string | null
  account_id: string | null
  amount: number
}

export type CheckingExpense = {
  id: number
  txn_date: string
  check_num: string | null
  description: string
  category: string | null
  account_id: string | null
  amount: number
}

export type CCTransaction = {
  id: number
  post_date: string
  txn_date: string
  account: string | null
  description: string
  category: string | null
  account_id: string | null
  amount: number
  personal: boolean
}

// ── Sales journal (revenue subledger) ────────────────────────────────────────
export type SaleTender = 'cash' | 'card' | 'check' | 'ach' | 'financing' | 'other'

export const TENDER_LABELS: Record<SaleTender, string> = {
  cash: 'Cash',
  card: 'Card',
  check: 'Check',
  ach: 'ACH',
  financing: 'Financing',
  other: 'Other',
}

export type SalesEntry = {
  id: string
  client_id: string
  entry_date: string
  account_id: string | null
  description: string | null
  memo: string | null
  tender: SaleTender
  processor: string | null
  qty: number | null
  amount: number
  source: string | null
  status: 'pending' | 'posted' | 'void'
  created_at: string
}

export type DocumentType =
  | 'business_license'
  | 'sellers_permit'
  | 'articles'
  | 'ein_letter'
  | 'statement_of_information'
  | 'insurance'
  | 'lease'
  | 'bank_statement'
  | 'tax_return'
  | 'agency_notice'
  | 'receipt'
  | 'other'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  business_license: 'Business License',
  sellers_permit: "Seller's Permit",
  articles: 'Articles of Inc./Org.',
  ein_letter: 'EIN Letter (CP-575)',
  statement_of_information: 'Statement of Information',
  insurance: 'Insurance',
  lease: 'Lease',
  bank_statement: 'Bank Statement',
  tax_return: 'Tax Return',
  agency_notice: 'Agency Notice',
  receipt: 'Receipt',
  other: 'Other',
}

export type GovAgency = 'cdtfa' | 'ftb' | 'edd' | 'irs' | 'sos' | 'city' | 'county' | 'other'

export const AGENCY_LABELS: Record<GovAgency, string> = {
  cdtfa: 'CDTFA',
  ftb: 'FTB',
  edd: 'EDD',
  irs: 'IRS',
  sos: 'CA SOS',
  city: 'City',
  county: 'County',
  other: 'Other',
}

export type ObligationFrequency =
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'biennial'
  | 'prepayment'
  | 'one_time'

export type Obligation = {
  id: string
  client_id: string
  agency: GovAgency
  kind: string
  label: string
  frequency: ObligationFrequency
  default_amount: number | null
  active: boolean
  notes: string | null
  created_at: string
}

export type EventStatus = 'upcoming' | 'due' | 'paid' | 'filed' | 'overdue' | 'waived'

export type ObligationEvent = {
  id: string
  obligation_id: string
  client_id: string
  period_label: string
  due_date: string
  amount_due: number | null
  amount_paid: number | null
  paid_date: string | null
  status: EventStatus
  confirmation: string | null
  notes: string | null
  created_at: string
  satisfied_by_txn?: string | null
  satisfied_by_doc?: string | null
  satisfied_auto?: boolean | null
}

export type EntityLogEntry = {
  id: string
  client_id: string
  at: string
  kind: string
  source: 'system' | 'overseer' | 'operator'
  actor: string
  title: string
  detail: string | null
  meta: Record<string, unknown> | null
  pinned: boolean
  created_by: string | null
  created_at: string
}

export type FieldReview = {
  id: string
  client_id: string
  field: string
  proposed_value: string
  current_value: string | null
  confidence: number | null
  source_doc_id: string | null
  source_doc_name: string | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
}

export type DetectedSignal = {
  id: string
  client_id: string
  type: string
  agency: string | null
  summary: string
  confidence: number
  source_table: string
  source_id: string
  amount: number | null
  txn_date: string | null
  status: 'open' | 'applied' | 'dismissed'
  proposed_action: { field?: string } | null
  created_at: string
}

export type DocumentRow = {
  id: string
  client_id: string
  name: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_by_role: 'admin' | 'client' | null
  created_at: string
  doc_type: DocumentType
  agency: GovAgency | null
  issued_date: string | null
  expires_date: string | null
  period_year?: number | null
  period_month?: number | null
  folder?: string | null
  ai_status?: 'pending' | 'parsed' | 'failed' | null
  ai_title?: string | null
  ai_summary?: string | null
  ai_tags?: string[] | null
  ai_fields?: Record<string, string> | null
  ai_applied?: boolean | null
  // Last 4 digits of the bank/card account this statement belongs to (an entity
  // may hold several accounts). Never the full number.
  account_ref?: string | null
  // SHA-256 of the file bytes — used to reject exact duplicate uploads.
  content_hash?: string | null
}

// Entity columns the AI is allowed to propose/apply.
export const ENTITY_APPLY_FIELDS = [
  'legal_name',
  'entity_type',
  'ein',
  'ca_sos_number',
  'cdtfa_account',
  'edd_account',
  'ftb_id',
  'formation_date',
  'naics_code',
  'address',
] as const

export const ENTITY_FIELD_LABELS: Record<string, string> = {
  legal_name: 'Legal name',
  entity_type: 'Entity type',
  ein: 'EIN',
  ca_sos_number: 'CA SOS number',
  cdtfa_account: 'CDTFA account',
  edd_account: 'EDD account',
  ftb_id: 'FTB ID',
  formation_date: 'Formation date',
  naics_code: 'NAICS code',
  address: 'Address',
}

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
  notes: string | null
}

export type Deposit = {
  id: number
  txn_date: string
  description: string
  type: string | null
  category: string | null
  amount: number
}

export type CheckingExpense = {
  id: number
  txn_date: string
  check_num: string | null
  description: string
  category: string | null
  amount: number
}

export type CCTransaction = {
  id: number
  post_date: string
  txn_date: string
  account: string | null
  description: string
  category: string | null
  amount: number
  personal: boolean
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
}

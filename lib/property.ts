// Property-management types, labels, and pure helpers. Client-safe (no
// server-only imports) so both server components and client components can pull
// types and formatters from here. Data fetching lives in lib/propertyServer.ts.

export type PropertyType = 'residential' | 'commercial' | 'mixed' | 'land'

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  mixed: 'Mixed-use',
  land: 'Land',
}

export type LeaseStatus = 'active' | 'upcoming' | 'ended'

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  active: 'Active',
  upcoming: 'Upcoming',
  ended: 'Ended',
}

export type ChargeStatus = 'due' | 'partial' | 'paid' | 'overdue' | 'waived'

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  due: 'Due',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  waived: 'Waived',
}

export type PaymentMethod = 'cash' | 'check' | 'ach' | 'card' | 'zelle' | 'other'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  ach: 'ACH / bank transfer',
  card: 'Card',
  zelle: 'Zelle',
  other: 'Other',
}

export type Property = {
  id: string
  client_id: string
  org_id: string | null
  name: string
  address: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  type: PropertyType
  multi_unit: boolean
  notes: string | null
  year_built: number | null
  lot_size: string | null
  parcel_number: string | null
  est_value: number | null
  purchase_price: number | null
  purchase_date: string | null
  pay_zelle: string | null
  pay_bank: string | null
  pay_check: string | null
  pay_other: string | null
  auto_reminders: boolean
  reminder_lead_days: number
  archived_at: string | null
  created_at: string
}

export type Unit = {
  id: string
  property_id: string
  client_id: string
  label: string
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  market_rent: number | null
  notes: string | null
  created_at: string
}

export type Lease = {
  id: string
  unit_id: string
  property_id: string
  client_id: string
  tenant_name: string
  tenant_email: string | null
  tenant_phone: string | null
  rent_amount: number
  deposit_amount: number | null
  rent_due_day: number
  start_date: string | null
  end_date: string | null
  status: LeaseStatus
  notes: string | null
  created_at: string
}

export type RentCharge = {
  id: string
  lease_id: string
  unit_id: string
  client_id: string
  invoice_number: string
  period_month: string
  due_date: string
  amount_due: number
  amount_paid: number
  paid_date: string | null
  status: ChargeStatus
  method: string | null
  reference: string | null
  last_reminder_at: string | null
  reminder_count: number
  notes: string | null
  created_at: string
}

export type RentPayment = {
  id: string
  charge_id: string
  lease_id: string
  unit_id: string
  client_id: string
  receipt_number: string
  amount: number
  paid_date: string
  method: string | null
  reference: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

// ── Google Maps imagery ─────────────────────────────────────────────────────
// The public Maps key (NEXT_PUBLIC_* → available on both server and client).
export function mapsKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
}

// A location string for the Maps imagery APIs: prefer exact coordinates, fall
// back to the address text (so a hand-typed property still gets a photo).
function mapsLocation(lat: number | null, lng: number | null, address?: string | null): string | null {
  if (lat != null && lng != null) return `${lat},${lng}`
  if (address && address.trim()) return encodeURIComponent(address.trim())
  return null
}

// A Street View photo of the location (an actual picture of the building where
// coverage exists). Returns null when there's no location or no key.
export function streetViewUrl(lat: number | null, lng: number | null, address?: string | null, size = '640x360'): string | null {
  const key = mapsKey()
  const loc = mapsLocation(lat, lng, address)
  if (!key || !loc) return null
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${loc}&fov=80&pitch=0&key=${key}`
}

// A satellite map centered on the location — the fallback when Street View has
// no imagery for the spot.
export function staticMapUrl(lat: number | null, lng: number | null, address?: string | null, size = '640x360'): string | null {
  const key = mapsKey()
  const loc = mapsLocation(lat, lng, address)
  if (!key || !loc) return null
  const marker = lat != null && lng != null ? `${lat},${lng}` : loc
  return `https://maps.googleapis.com/maps/api/staticmap?center=${loc}&zoom=18&size=${size}&maptype=satellite&markers=color:0x111827%7C${marker}&key=${key}`
}

// The set payment methods for a property, as label/value pairs, for rendering
// a "How to pay" block in emails and the UI. Empty when none are configured.
export function paymentInstructions(
  p: Pick<Property, 'pay_zelle' | 'pay_bank' | 'pay_check' | 'pay_other'>
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  if (p.pay_zelle) out.push({ label: 'Zelle', value: p.pay_zelle })
  if (p.pay_bank) out.push({ label: 'Bank deposit / ACH', value: p.pay_bank })
  if (p.pay_check) out.push({ label: 'Check', value: p.pay_check })
  if (p.pay_other) out.push({ label: 'Other', value: p.pay_other })
  return out
}

// ── Tenant profiles + documents (Phase 2) ──────────────────────────────────

export type TenantProfile = {
  id: string
  client_id: string
  lease_id: string
  dob: string | null
  current_address: string | null
  employer: string | null
  monthly_income: number | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  id_type: string | null
  ssn_last4: string | null // full SSN is stored encrypted server-side, never sent to the client
  notes: string | null
  created_at: string
  updated_at: string
}

export type IdType = 'drivers_license' | 'passport' | 'state_id' | 'other'
export const ID_TYPE_LABELS: Record<IdType, string> = {
  drivers_license: "Driver's license",
  passport: 'Passport',
  state_id: 'State ID',
  other: 'Other',
}

export type DocKind =
  | 'photo'
  | 'lease_agreement'
  | 'id'
  | 'application'
  | 'insurance'
  | 'inspection'
  | 'tax'
  | 'statement'
  | 'receipt'
  | 'invoice'
  | 'bill'
  | 'notice'
  | 'other'
export const DOC_KIND_LABELS: Record<DocKind, string> = {
  photo: 'Photo',
  lease_agreement: 'Lease agreement',
  id: 'ID / license',
  application: 'Application',
  insurance: 'Insurance',
  inspection: 'Inspection',
  tax: 'Tax / property',
  statement: 'Statement',
  receipt: 'Receipt',
  invoice: 'Invoice',
  bill: 'Bill',
  notice: 'Notice',
  other: 'Other',
}

// ── Property operating expenses (feed the P&L) ──────────────────────────────
export type ExpenseCategory =
  | 'water'
  | 'gas'
  | 'electric'
  | 'internet'
  | 'trash'
  | 'utilities'
  | 'repairs'
  | 'maintenance'
  | 'insurance'
  | 'property_tax'
  | 'hoa'
  | 'management'
  | 'mortgage_interest'
  | 'landscaping'
  | 'pest'
  | 'cleaning'
  | 'supplies'
  | 'legal'
  | 'other'
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  water: 'Water',
  gas: 'Gas',
  electric: 'Electric',
  internet: 'Internet',
  trash: 'Trash',
  utilities: 'Utilities',
  repairs: 'Repairs',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  property_tax: 'Property tax',
  hoa: 'HOA',
  management: 'Management',
  mortgage_interest: 'Mortgage interest',
  landscaping: 'Landscaping',
  pest: 'Pest control',
  cleaning: 'Cleaning',
  supplies: 'Supplies',
  legal: 'Legal / professional',
  other: 'Other',
}
export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]

export type PropertyExpense = {
  id: string
  client_id: string
  property_id: string
  unit_id: string | null
  document_id: string | null
  category: ExpenseCategory
  vendor: string | null
  description: string | null
  amount: number
  incurred_on: string
  source: 'manual' | 'overseer'
  notes: string | null
  created_by: string | null
  created_at: string
}

// Coerce a free-text category (from the Overseer) into a known ExpenseCategory.
export function normalizeExpenseCategory(raw: string | null | undefined): ExpenseCategory {
  const s = (raw ?? '').toLowerCase().trim()
  if ((EXPENSE_CATEGORY_LABELS as Record<string, string>)[s]) return s as ExpenseCategory
  if (s === 'power' || s === 'electricity') return 'electric'
  if (s === 'sewer' || s === 'sewage') return 'water'
  if (s === 'repair') return 'repairs'
  if (s === 'tax' || s === 'taxes') return 'property_tax'
  return 'other'
}

export type PropertyDocument = {
  id: string
  client_id: string
  property_id: string
  unit_id: string | null
  lease_id: string | null
  name: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  doc_kind: DocKind
  uploaded_by: string | null
  ai_status: 'pending' | 'parsed' | 'failed' | null
  ai_summary: string | null
  ai_fields: Record<string, unknown> | null
  sort_order: number
  created_at: string
}

// ── Per-property collaborators (third-party managers granted one property) ──
export type CollaboratorRole = 'manager' | 'viewer'
export type CollaboratorStatus = 'invited' | 'active' | 'removed'
export const COLLABORATOR_ROLE_LABELS: Record<CollaboratorRole, string> = {
  manager: 'Manager',
  viewer: 'Viewer',
}
export const COLLABORATOR_STATUS_LABELS: Record<CollaboratorStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  removed: 'Removed',
}
// The invite token is intentionally omitted — it never leaves the server layer.
export type Collaborator = {
  id: string
  property_id: string
  client_id: string
  user_id: string | null
  email: string
  name: string | null
  role: CollaboratorRole
  status: CollaboratorStatus
  invited_by: string | null
  invited_at: string
  accepted_at: string | null
  created_at: string
}

// Masked SSN for display: •••-••-1234.
export function maskSsn(last4: string | null): string {
  return last4 ? `•••-••-${last4}` : '—'
}

export type ApplicationStatus = 'invited' | 'submitted' | 'approved' | 'declined' | 'withdrawn'
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  invited: 'Invited',
  submitted: 'Submitted',
  approved: 'Approved',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

// One yes/no screening question and its optional explanation.
export type ScreeningAnswer = { yes: boolean; explanation?: string | null }

// The comprehensive application extras, stored as a single JSONB `details`
// column on rental_applications so the form can grow without schema churn.
// Core identity/contact/income stays in typed columns above.
export type ApplicationDetails = {
  // Personal / ID
  id_number?: string | null
  id_state?: string | null
  // Residence history
  current_landlord?: string | null
  current_landlord_phone?: string | null
  current_rent?: number | null
  current_since?: string | null
  reason_leaving?: string | null
  prior_address?: string | null
  prior_landlord_phone?: string | null
  prior_rent?: number | null
  prior_dates?: string | null
  prior_reason_leaving?: string | null
  // Employment / income
  job_title?: string | null
  employer_phone?: string | null
  supervisor?: string | null
  employed_since?: string | null
  other_income_source?: string | null
  other_income_amount?: number | null
  // Household
  co_applicant?: string | null
  other_occupants?: string | null
  // Emergency contact
  emergency_name?: string | null
  emergency_relationship?: string | null
  emergency_phone?: string | null
  // Background screening
  screening?: Record<string, ScreeningAnswer>
  // Certification / e-signature
  signature?: string | null
  signed_date?: string | null
}

// Background screening questions asked on the application (key → prompt).
export const SCREENING_QUESTIONS: { key: string; prompt: string }[] = [
  { key: 'evicted', prompt: 'Have you ever been evicted or asked to move out?' },
  { key: 'broke_lease', prompt: 'Have you ever broken a lease or rental agreement?' },
  { key: 'bankruptcy', prompt: 'Have you ever filed for bankruptcy?' },
  { key: 'felony', prompt: 'Have you ever been convicted of a felony?' },
  { key: 'refused_rent', prompt: 'Have you ever willfully refused to pay rent when due?' },
  { key: 'smoker', prompt: 'Does anyone in the household smoke?' },
]

// Never carries ssn_enc — the encrypted SSN stays server-side; only ssn_last4 is exposed.
export type RentalApplication = {
  id: string
  client_id: string
  property_id: string
  unit_id: string | null
  token: string
  status: ApplicationStatus
  invite_email: string | null
  invited_at: string
  submitted_at: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  dob: string | null
  current_address: string | null
  employer: string | null
  monthly_income: number | null
  desired_move_in: string | null
  occupants: number | null
  pets: string | null
  vehicles: string | null
  prior_landlord: string | null
  references_text: string | null
  ssn_last4: string | null
  consent_bg: boolean
  notes: string | null
  details: ApplicationDetails | null
  created_at: string
}

export type TenantMessage = {
  id: string
  client_id: string
  lease_id: string
  property_id: string | null
  unit_id: string | null
  direction: 'outbound' | 'inbound'
  channel: 'email' | 'note' | 'sms'
  subject: string | null
  body: string
  to_email: string | null
  sent_by: string | null
  status: 'sent' | 'failed' | 'logged'
  created_at: string
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export const usd = (n: number) =>
  (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const usdCents = (n: number) =>
  (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// "2026-08-01" → "August 2026" (no timezone drift — parse the parts by hand).
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) return period
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// "2026-08-01" → "Aug 2026".
export function monthLabelShort(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) return period
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// First-of-month ISO date string for `d` (defaults to today), local time.
export function firstOfMonth(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// Given a period month (first-of-month ISO) and a due day, the due date ISO.
export function dueDateFor(periodMonth: string, dueDay: number): string {
  const [y, m] = periodMonth.split('-').map(Number)
  const day = Math.min(Math.max(dueDay || 1, 1), 28)
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// The `count` consecutive month-firsts starting at `start` (inclusive).
export function monthsFrom(start: string, count: number): string[] {
  const [y, m] = start.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - 1 + i, 1)
    out.push(firstOfMonth(d))
  }
  return out
}

// Local-time ISO date (YYYY-MM-DD) for `d`, no timezone drift.
export function isoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Effective status for a charge as of `today`, upgrading an unpaid past-due
// line to 'overdue' for display without mutating the row.
export function effectiveChargeStatus(
  c: Pick<RentCharge, 'status' | 'due_date' | 'amount_due' | 'amount_paid'>,
  today = new Date()
): ChargeStatus {
  if (c.status === 'paid' || c.status === 'waived') return c.status
  if (c.amount_paid >= c.amount_due && c.amount_due > 0) return 'paid'
  const isPastDue = c.due_date.slice(0, 10) < isoDate(today)
  if (isPastDue && c.amount_paid < c.amount_due) return 'overdue'
  if (c.amount_paid > 0 && c.amount_paid < c.amount_due) return 'partial'
  return c.status
}

export type PropertyStats = {
  units: number
  occupied: number
  vacant: number
  monthlyRent: number      // sum of active-lease rents
  collectedThisMonth: number
  dueThisMonth: number
  outstanding: number      // all-time unpaid (amount_due - amount_paid) on non-waived charges
}

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
  notes: string | null
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

// A Street View photo of the location (an actual picture of the building where
// coverage exists). Returns null when we have no coordinates or no key.
export function streetViewUrl(lat: number | null, lng: number | null, size = '640x360'): string | null {
  const key = mapsKey()
  if (!key || lat == null || lng == null) return null
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&fov=80&pitch=0&key=${key}`
}

// A satellite map centered on the location — the fallback when Street View has
// no imagery for the spot.
export function staticMapUrl(lat: number | null, lng: number | null, size = '640x360'): string | null {
  const key = mapsKey()
  if (!key || lat == null || lng == null) return null
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=${size}&maptype=satellite&markers=color:0x111827%7C${lat},${lng}&key=${key}`
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

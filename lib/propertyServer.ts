import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Property,
  type Unit,
  type Lease,
  type RentCharge,
  type RentPayment,
  type TenantProfile,
  type PropertyDocument,
  type TenantMessage,
  type RentalApplication,
  type PropertyStats,
  type Collaborator,
  type PropertyExpense,
  firstOfMonth,
} from '@/lib/property'

// Collaborator columns to expose — deliberately excludes `token` (the invite
// token never leaves the server layer).
const COLLABORATOR_COLUMNS =
  'id, property_id, client_id, user_id, email, name, role, status, invited_by, invited_at, accepted_at, created_at'

// Application columns to expose — deliberately excludes ssn_enc (the encrypted
// SSN never leaves the server layer; only ssn_last4 is surfaced).
const APPLICATION_COLUMNS =
  'id, client_id, property_id, unit_id, token, status, invite_email, invited_at, submitted_at, full_name, email, phone, dob, current_address, employer, monthly_income, desired_move_in, occupants, pets, vehicles, prior_landlord, references_text, ssn_last4, consent_bg, notes, details, created_at'

const DOCS_BUCKET = 'client-docs'

// Data access for the property module. Every function takes the caller's
// Supabase server client so Row-Level Security scopes results to what the
// viewer may read (workers see their entities; a portal client sees their own).
// Mirrors the (supabase, …) signature style of yearsServer / recentsServer.

type DB = SupabaseClient

export async function getProperties(supabase: DB, opts: { includeArchived?: boolean } = {}): Promise<Property[]> {
  let q = supabase.from('properties').select('*').order('name')
  if (!opts.includeArchived) q = q.is('archived_at', null)
  const { data } = await q
  return (data ?? []) as Property[]
}

export type PortfolioRow = { property: Property; stats: PropertyStats; coverUrl: string | null }

// The whole portfolio the viewer can see, each property with rolled-up stats
// for the given month (defaults to the current month) and its cover photo.
export async function getPortfolio(supabase: DB, month = firstOfMonth()): Promise<PortfolioRow[]> {
  const properties = await getProperties(supabase)
  if (properties.length === 0) return []
  const ids = properties.map((p) => p.id)

  // Units first — their ids scope the month's rent charges.
  const { data: unitRows } = await supabase.from('units').select('*').in('property_id', ids)
  const U = (unitRows ?? []) as Unit[]
  const unitIds = U.map((u) => u.id)

  const [{ data: leases }, { data: charges }, { data: photoRows }] = await Promise.all([
    supabase.from('leases').select('*').in('property_id', ids),
    unitIds.length
      ? supabase.from('rent_charges').select('*').eq('period_month', month).in('unit_id', unitIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from('property_documents')
      .select('property_id, storage_path')
      .eq('doc_kind', 'photo')
      .in('property_id', ids)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
  ])

  const L = (leases ?? []) as Lease[]
  const C = (charges ?? []) as RentCharge[]
  const unitToProperty = new Map(U.map((u) => [u.id, u.property_id]))

  // Cover photo per property = the first (lowest sort_order) photo. Sign it.
  const coverPath = new Map<string, string>()
  for (const r of (photoRows ?? []) as { property_id: string; storage_path: string }[]) {
    if (!coverPath.has(r.property_id)) coverPath.set(r.property_id, r.storage_path)
  }
  const coverUrl = new Map<string, string | null>()
  await Promise.all(
    [...coverPath.entries()].map(async ([pid, path]) => {
      const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 600)
      coverUrl.set(pid, signed?.signedUrl ?? null)
    })
  )

  return properties.map((property) => {
    const pu = U.filter((u) => u.property_id === property.id)
    const pl = L.filter((l) => l.property_id === property.id)
    const pc = C.filter((c) => unitToProperty.get(c.unit_id) === property.id)
    return { property, stats: computeStats(pu, pl, pc), coverUrl: coverUrl.get(property.id) ?? null }
  })
}

export type PropertyDocWithUrl = PropertyDocument & { url: string | null }

export type PropertyDetail = {
  property: Property
  units: Unit[]
  leases: Lease[]
  charges: RentCharge[]
  payments: RentPayment[]
  tenantProfiles: TenantProfile[]
  documents: PropertyDocWithUrl[]
  messages: TenantMessage[]
  applications: RentalApplication[]
  collaborators: Collaborator[]
  expenses: PropertyExpense[]
}

// One property with its units, leases, rent charges, payments, tenant profiles,
// and documents (all-time). Returns null if not visible to the viewer.
export async function getProperty(supabase: DB, id: string): Promise<PropertyDetail | null> {
  const { data: prop } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!prop) return null
  const property = prop as Property

  const { data: units } = await supabase.from('units').select('*').eq('property_id', id).order('label')
  const U = (units ?? []) as Unit[]
  const unitIds = U.map((u) => u.id)

  const [{ data: leases }, { data: charges }, { data: payments }, { data: docs }, { data: apps }] = await Promise.all([
    unitIds.length
      ? supabase.from('leases').select('*').in('unit_id', unitIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    unitIds.length
      ? supabase.from('rent_charges').select('*').in('unit_id', unitIds).order('period_month', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    unitIds.length
      ? supabase.from('rent_payments').select('*').in('unit_id', unitIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('property_documents').select('*').eq('property_id', id).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('rental_applications').select(APPLICATION_COLUMNS).eq('property_id', id).order('invited_at', { ascending: false }),
  ])

  const { data: collabRows } = await supabase
    .from('property_access')
    .select(COLLABORATOR_COLUMNS)
    .eq('property_id', id)
    .neq('status', 'removed')
    .order('created_at', { ascending: true })

  const { data: expenseRows } = await supabase
    .from('property_expenses')
    .select('*')
    .eq('property_id', id)
    .order('incurred_on', { ascending: false })

  const L = (leases ?? []) as Lease[]
  const leaseIds = L.map((l) => l.id)
  const [{ data: profiles }, { data: messages }] = leaseIds.length
    ? await Promise.all([
        supabase.from('tenant_profiles').select('*').in('lease_id', leaseIds),
        supabase.from('tenant_messages').select('*').in('lease_id', leaseIds).order('created_at', { ascending: true }),
      ])
    : [{ data: [] as unknown[] }, { data: [] as unknown[] }]

  // Short-lived signed URLs so documents can be opened/downloaded from the page.
  const D = (docs ?? []) as PropertyDocument[]
  const documents: PropertyDocWithUrl[] = await Promise.all(
    D.map(async (doc) => {
      const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 600)
      return { ...doc, url: signed?.signedUrl ?? null }
    })
  )

  return {
    property,
    units: U,
    leases: L,
    charges: (charges ?? []) as RentCharge[],
    payments: (payments ?? []) as RentPayment[],
    tenantProfiles: (profiles ?? []) as TenantProfile[],
    documents,
    messages: (messages ?? []) as TenantMessage[],
    applications: (apps ?? []) as RentalApplication[],
    collaborators: (collabRows ?? []) as Collaborator[],
    expenses: (expenseRows ?? []) as PropertyExpense[],
  }
}

// The single active lease for a unit, if any (newest wins).
export function activeLeaseFor(unitId: string, leases: Lease[]): Lease | null {
  return leases.find((l) => l.unit_id === unitId && l.status === 'active') ?? null
}

// Roll up stats for a set of units/leases/charges (charges should already be
// scoped to the month of interest for the collected/due figures).
export function computeStats(units: Unit[], leases: Lease[], monthCharges: RentCharge[]): PropertyStats {
  const activeLeases = leases.filter((l) => l.status === 'active')
  const occupiedUnitIds = new Set(activeLeases.map((l) => l.unit_id))
  const monthlyRent = activeLeases.reduce((s, l) => s + Number(l.rent_amount || 0), 0)
  const collectedThisMonth = monthCharges.reduce((s, c) => s + Number(c.amount_paid || 0), 0)
  const dueThisMonth = monthCharges
    .filter((c) => c.status !== 'waived')
    .reduce((s, c) => s + Number(c.amount_due || 0), 0)
  const outstanding = monthCharges
    .filter((c) => c.status !== 'waived')
    .reduce((s, c) => s + Math.max(Number(c.amount_due || 0) - Number(c.amount_paid || 0), 0), 0)
  return {
    units: units.length,
    occupied: occupiedUnitIds.size,
    vacant: Math.max(units.length - occupiedUnitIds.size, 0),
    monthlyRent,
    collectedThisMonth,
    dueThisMonth,
    outstanding,
  }
}

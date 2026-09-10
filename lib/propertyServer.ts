import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Property,
  type Unit,
  type Lease,
  type RentCharge,
  type RentPayment,
  type PropertyStats,
  firstOfMonth,
} from '@/lib/property'

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

export type PortfolioRow = { property: Property; stats: PropertyStats }

// The whole portfolio the viewer can see, each property with rolled-up stats
// for the given month (defaults to the current month).
export async function getPortfolio(supabase: DB, month = firstOfMonth()): Promise<PortfolioRow[]> {
  const properties = await getProperties(supabase)
  if (properties.length === 0) return []
  const ids = properties.map((p) => p.id)

  // Units first — their ids scope the month's rent charges.
  const { data: unitRows } = await supabase.from('units').select('*').in('property_id', ids)
  const U = (unitRows ?? []) as Unit[]
  const unitIds = U.map((u) => u.id)

  const [{ data: leases }, { data: charges }] = await Promise.all([
    supabase.from('leases').select('*').in('property_id', ids),
    unitIds.length
      ? supabase.from('rent_charges').select('*').eq('period_month', month).in('unit_id', unitIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const L = (leases ?? []) as Lease[]
  const C = (charges ?? []) as RentCharge[]
  const unitToProperty = new Map(U.map((u) => [u.id, u.property_id]))

  return properties.map((property) => {
    const pu = U.filter((u) => u.property_id === property.id)
    const pl = L.filter((l) => l.property_id === property.id)
    const pc = C.filter((c) => unitToProperty.get(c.unit_id) === property.id)
    return { property, stats: computeStats(pu, pl, pc) }
  })
}

export type PropertyDetail = {
  property: Property
  units: Unit[]
  leases: Lease[]
  charges: RentCharge[]
  payments: RentPayment[]
}

// One property with its units, leases, rent charges, and payments (all-time).
// Returns null if the property is not visible to the viewer.
export async function getProperty(supabase: DB, id: string): Promise<PropertyDetail | null> {
  const { data: prop } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!prop) return null
  const property = prop as Property

  const { data: units } = await supabase.from('units').select('*').eq('property_id', id).order('label')
  const U = (units ?? []) as Unit[]
  const unitIds = U.map((u) => u.id)

  const [{ data: leases }, { data: charges }, { data: payments }] = await Promise.all([
    unitIds.length
      ? supabase.from('leases').select('*').in('unit_id', unitIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    unitIds.length
      ? supabase.from('rent_charges').select('*').in('unit_id', unitIds).order('period_month', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    unitIds.length
      ? supabase.from('rent_payments').select('*').in('unit_id', unitIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  return {
    property,
    units: U,
    leases: (leases ?? []) as Lease[],
    charges: (charges ?? []) as RentCharge[],
    payments: (payments ?? []) as RentPayment[],
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

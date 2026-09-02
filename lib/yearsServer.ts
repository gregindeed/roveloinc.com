import 'server-only'

import type { createClient } from '@/lib/supabase/server'

type DB = ReturnType<typeof createClient>

export type ClientYear = { year: number; status: 'active' | 'closed'; closed_at: string | null }

// The tax years this entity has opened, newest first.
export async function getClientYears(supabase: DB, clientId: string): Promise<ClientYear[]> {
  const { data } = await supabase
    .from('client_years')
    .select('year, status, closed_at')
    .eq('client_id', clientId)
    .order('year', { ascending: false })
  return (data ?? []).map((r) => ({
    year: r.year as number,
    status: (r.status as 'active' | 'closed') ?? 'active',
    closed_at: (r.closed_at as string | null) ?? null,
  }))
}

// The default year to land on: newest active, else newest of any.
export function defaultYear(years: ClientYear[], fallback = new Date().getFullYear()): number {
  const active = years.find((y) => y.status === 'active')
  if (active) return active.year
  return years[0]?.year ?? fallback
}

// Is a given tax year closed (locked) for this entity? Absent = treated as open.
export async function isYearClosed(supabase: DB, clientId: string, year: number): Promise<boolean> {
  const { data } = await supabase
    .from('client_years')
    .select('status')
    .eq('client_id', clientId)
    .eq('year', year)
    .maybeSingle()
  return data?.status === 'closed'
}

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { type Locale, isLocale } from '@/lib/i18n'

export type Role = 'admin' | 'collaborator' | 'client' | null

export type FirmMembership = { orgId: string; name: string; role: string; isPlatform: boolean }

export type Viewer = {
  userId: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  locale: Locale
  role: Role
  isOwner: boolean
  clientId: string | null
  orgId: string | null
  // Firms this person is a manager of (one row per firm). Collaborators appear
  // here only where they hold an admin role; their per-client work is via grants.
  firms: FirmMembership[]
  // Platform super-admin: an admin in the platform firm (Rovelo). Sees/manages
  // every firm's clients.
  isPlatform: boolean
}

// The current signed-in user's profile, or null if not signed in.
//
// Wrapped in React cache(): within a single server render (or a single server
// action), the layout, the page, and any requireWorker/requireAdmin guard all
// share ONE resolution instead of each firing its own getUser() + profile
// queries. That collapses the repeated auth-server round-trips that made every
// navigation feel laggy. cache() is per-request, so there's no cross-request
// staleness — each new request re-resolves.
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const [{ data: p }, { data: mems }] = await Promise.all([
    supabase.from('profiles').select('role, is_owner, client_id, org_id, display_name, avatar_url, locale').eq('id', user.id).single(),
    supabase.from('memberships').select('org_id, role, organizations(name, is_platform)').eq('user_id', user.id),
  ])
  const firms: FirmMembership[] = (mems ?? []).map((m) => {
    const o = (m.organizations ?? null) as { name?: string; is_platform?: boolean } | null
    return { orgId: m.org_id as string, name: o?.name ?? '', role: m.role as string, isPlatform: !!o?.is_platform }
  })
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: (p?.display_name as string | null) ?? null,
    avatarUrl: (p?.avatar_url as string | null) ?? null,
    locale: isLocale(p?.locale) ? p.locale : 'en',
    role: (p?.role as Role) ?? null,
    isOwner: !!p?.is_owner,
    clientId: (p?.client_id as string | null) ?? null,
    orgId: (p?.org_id as string | null) ?? null,
    firms,
    isPlatform: firms.some((f) => f.role === 'admin' && f.isPlatform),
  }
})

// Any work-side user (owner, manager, or collaborator). RLS scopes what they touch.
export async function requireWorker(): Promise<Viewer> {
  const v = await getViewer()
  if (!v) redirect('/login')
  if (v.role !== 'admin' && v.role !== 'collaborator') redirect('/portal')
  return v
}

// Managers / owner only (cross-entity actions like creating a client). Not collaborators.
export async function requireAdmin(): Promise<Viewer> {
  const v = await getViewer()
  if (!v) redirect('/login')
  if (v.role !== 'admin') redirect('/portal')
  return v
}

// Owner only — team management.
export async function requireOwner(): Promise<Viewer> {
  const v = await getViewer()
  if (!v) redirect('/login')
  if (!v.isOwner) redirect('/admin')
  return v
}

// Platform super-admin only — manage firms across the platform.
export async function requirePlatform(): Promise<Viewer> {
  const v = await getViewer()
  if (!v) redirect('/login')
  if (!v.isPlatform) redirect('/admin')
  return v
}

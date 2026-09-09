import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AuthHeader from '@/components/AuthHeader'
import { type RosterRow } from '@/components/ClientRoster'
import AdminDashboard, { type FirmLite } from '@/components/AdminDashboard'
import { getViewer } from '@/lib/auth'
import { getRecentEntities } from '@/lib/recentsServer'
import { entityPresence } from '@/lib/presenceServer'
import { deriveAttention, type StateRow } from '@/lib/brief'
import { ENTITY_TYPE_LABELS, type Client, type EntityType, type Organization } from '@/lib/types'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Admin — Rovelo Inc',
  robots: { index: false, follow: false },
}

// Minimal text nav action — no border, just a quiet link.
const navAction = 'inline-flex items-center gap-1 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors'

function Plus({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default async function AdminHome({ searchParams }: { searchParams: { ok?: string } }) {
  const locale = getLocale()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()

  const [
    { data: clients },
    { data: obligations },
    { data: events },
    { data: orgs },
    { data: states },
    { data: pendingReviews },
    { data: openProposals },
  ] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('obligations').select('client_id').eq('verified', true),
    supabase.from('obligation_events').select('client_id, due_date, status').eq('verified', true),
    supabase.from('organizations').select('*').order('is_platform', { ascending: false }).order('name'),
    supabase.from('entity_state').select('*'),
    supabase.from('field_reviews').select('client_id').eq('status', 'pending'),
    supabase.from('detected_signals').select('client_id').eq('status', 'open').like('type', 'propose_%'),
  ])

  const all = (clients ?? []) as Client[]
  const list = all.filter((c) => !c.archived_at)
  const archived = all.filter((c) => c.archived_at)
  const firms = (orgs ?? []) as Organization[]
  const today = new Date().toISOString().slice(0, 10)
  const isPlatform = !!viewer?.isPlatform

  const hasOb = new Set((obligations ?? []).map((o) => o.client_id))
  const overdueByClient: Record<string, number> = {}
  for (const e of events ?? []) {
    const open = e.status !== 'paid' && e.status !== 'filed' && e.status !== 'waived'
    if (open && e.due_date < today) overdueByClient[e.client_id] = (overdueByClient[e.client_id] ?? 0) + 1
  }
  const stateByClient = new Map((states ?? []).map((s) => [s.client_id as string, s as unknown as StateRow]))
  const readinessByClient: Record<string, number> = {}
  for (const s of states ?? []) readinessByClient[s.client_id as string] = s.overall as number

  const countBy = (rows: { client_id: string }[] | null) => {
    const m: Record<string, number> = {}
    for (const r of rows ?? []) m[r.client_id] = (m[r.client_id] ?? 0) + 1
    return m
  }
  const reviewCount = countBy(pendingReviews as { client_id: string }[] | null)
  const proposalCount = countBy(openProposals as { client_id: string }[] | null)

  // Who's currently working in each entity (excludes you).
  const presenceByClient = await entityPresence(
    createAdminClient(),
    list.map((c) => c.id),
    { excludeUserId: user?.id }
  )

  // The active tax year each entity is working in (newest open, else newest).
  const { data: cyRows } = await supabase.from('client_years').select('client_id, year, status')
  const yearsByClient = new Map<string, { year: number; active: boolean }[]>()
  for (const r of cyRows ?? []) {
    const cid = r.client_id as string
    const arr = yearsByClient.get(cid) ?? []
    arr.push({ year: r.year as number, active: r.status !== 'closed' })
    yearsByClient.set(cid, arr)
  }
  const activeYear = (cid: string): number | null => {
    const ys = yearsByClient.get(cid) ?? []
    const open = ys.filter((y) => y.active).map((y) => y.year)
    if (open.length) return Math.max(...open)
    return ys.length ? Math.max(...ys.map((y) => y.year)) : null
  }

  const attentionByClient = new Map<string, RosterRow['attention']>()
  for (const c of all) {
    const a = deriveAttention({
      client: { id: c.id, name: c.name, slug: c.slug },
      state: stateByClient.get(c.id) ?? null,
      pendingReviews: reviewCount[c.id] ?? 0,
      openProposals: proposalCount[c.id] ?? 0,
    })
    if (a) attentionByClient.set(c.id, { level: a.level, reasons: a.reasons })
  }

  const toRows = (cs: Client[]): RosterRow[] =>
    cs.map((c) => {
      const isIndiv = c.kind === 'individual'
      // Individuals have no entity type or EIN — describe the person instead:
      // residency in the "type" slot, ITIN/SSN in the "EIN" slot.
      const typeLabel = isIndiv
        ? t(locale, c.residency === 'nonresident' ? 'admin.nonresident' : 'admin.resident')
        : c.entity_type
          ? ENTITY_TYPE_LABELS[c.entity_type as EntityType]
          : null
      const idLabel = isIndiv ? (c.tax_id_type ? c.tax_id_type.toUpperCase() : null) : c.ein
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        sub: c.owner_name ?? c.legal_name ?? c.slug,
        typeLabel,
        ein: idLabel,
        status: c.status,
        readiness: readinessByClient[c.id],
        overdue: overdueByClient[c.id] ?? 0,
        enrolled: hasOb.has(c.id),
        attention: attentionByClient.get(c.id),
        presence: presenceByClient.get(c.id),
        year: activeYear(c.id),
        orgId: c.org_id ?? null,
        kind: isIndiv ? 'individual' : 'business',
      }
    })

  const byOrg: Record<string, Client[]> = {}
  for (const c of list) (byOrg[c.org_id ?? 'none'] ??= []).push(c)
  const firmsWithRows = firms.filter((f) => (byOrg[f.id] ?? []).length > 0)

  // Entities granted to me that live in a firm I'm not a member of (cross-firm
  // collaborator access) have no firm group to render under — surface them here
  // so they don't silently vanish from the dashboard.
  const shownOrgIds = new Set(firmsWithRows.map((f) => f.id))
  const sharedRows = list.filter((c) => !c.org_id || !shownOrgIds.has(c.org_id))

  const firmLites: FirmLite[] = firmsWithRows.map((f) => ({ id: f.id, name: f.name, isPlatform: !!f.is_platform }))
  const recents = user ? await getRecentEntities(supabase, user.id, 6) : []

  // Top-nav actions: New Firm is the highest-level action (platform only);
  // partner managers get a direct New Account instead.
  const navActions = (
    <>
      {isPlatform ? (
        <Link href="/admin/firms/new" className={navAction}>
          <Plus className="h-3 w-3 text-gray-400" /> {t(locale, 'admin.newFirm')}
        </Link>
      ) : viewer?.role === 'admin' ? (
        <Link href="/admin/new/guided" className={navAction}>
          <Plus className="h-3 w-3 text-gray-400" /> {t(locale, 'admin.newAccount')}
        </Link>
      ) : null}
    </>
  )

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader
        label={t(locale, 'admin.adminNav')}
        email={user?.email}
        settingsHref={viewer?.isOwner ? '/admin/team' : null}
        actions={navActions}
      />
      <main className="max-w-5xl mx-auto px-6 py-10">
        {searchParams.ok && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}

        {list.length === 0 && archived.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">{t(locale, 'admin.noAccounts')}</p>
            {isPlatform ? (
              <Link href="/admin/firms/new" className={`${navAction} mt-4`}>
                <Plus className="h-3 w-3 text-gray-400" /> {t(locale, 'admin.onboardFirstFirm')}
              </Link>
            ) : viewer?.role === 'admin' ? (
              <Link href="/admin/new/guided" className={`${navAction} mt-4`}>
                <Plus className="h-3 w-3 text-gray-400" /> {t(locale, 'admin.onboardFirstAccount')}
              </Link>
            ) : null}
          </div>
        ) : (
          <AdminDashboard
            firms={firmLites}
            rows={toRows(list)}
            sharedRows={toRows(sharedRows)}
            archivedRows={toRows(archived)}
            recents={recents}
            viewerRole={viewer?.role ?? null}
            isPlatform={isPlatform}
          />
        )}
      </main>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import ClientRoster, { type RosterRow } from '@/components/ClientRoster'
import FirmMenu from '@/components/FirmMenu'
import { getViewer } from '@/lib/auth'
import { deriveAttention, type StateRow } from '@/lib/brief'
import { ENTITY_TYPE_LABELS, type Client, type EntityType, type Organization } from '@/lib/types'

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
    supabase.from('obligations').select('client_id'),
    supabase.from('obligation_events').select('client_id, due_date, status'),
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
    cs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      sub: c.owner_name ?? c.legal_name ?? c.slug,
      typeLabel: c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type as EntityType] : null,
      ein: c.ein,
      status: c.status,
      readiness: readinessByClient[c.id],
      overdue: overdueByClient[c.id] ?? 0,
      enrolled: hasOb.has(c.id),
      attention: attentionByClient.get(c.id),
    }))

  const byOrg: Record<string, Client[]> = {}
  for (const c of list) (byOrg[c.org_id ?? 'none'] ??= []).push(c)
  const firmsWithRows = firms.filter((f) => (byOrg[f.id] ?? []).length > 0)

  // Top-nav actions: New Firm is the highest-level action (platform only);
  // partner managers get a direct New Account instead.
  const navActions = (
    <>
      {isPlatform ? (
        <Link href="/admin/firms/new" className={navAction}>
          <Plus className="h-3 w-3 text-gray-400" /> New firm
        </Link>
      ) : viewer?.role === 'admin' ? (
        <Link href="/admin/new/guided" className={navAction}>
          <Plus className="h-3 w-3 text-gray-400" /> New account
        </Link>
      ) : null}
    </>
  )

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader
        label="Admin"
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

        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No accounts yet.</p>
            {isPlatform ? (
              <Link href="/admin/firms/new" className={`${navAction} mt-4`}>
                <Plus className="h-3 w-3 text-gray-400" /> Onboard your first firm
              </Link>
            ) : viewer?.role === 'admin' ? (
              <Link href="/admin/new/guided" className={`${navAction} mt-4`}>
                <Plus className="h-3 w-3 text-gray-400" /> Onboard your first account
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-8">
            {firmsWithRows.map((f) => {
              const rows = byOrg[f.id] ?? []
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {f.name}
                      {f.is_platform && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">Your firm</span>
                      )}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {rows.length} account{rows.length === 1 ? '' : 's'}
                      </span>
                    </h2>
                    {viewer?.role === 'admin' && <FirmMenu firmId={f.id} canManage={isPlatform} />}
                  </div>
                  <ClientRoster rows={toRows(rows)} />
                </div>
              )
            })}
          </div>
        )}

        {archived.length > 0 && (
          <details className="mt-10 group">
            <summary className="cursor-pointer text-sm font-semibold text-gray-500 hover:text-gray-800 select-none">
              Archived · {archived.length}
            </summary>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              No longer active engagements. Books are kept; open one to restore it.
            </p>
            <div className="opacity-70">
              <ClientRoster rows={toRows(archived)} />
            </div>
          </details>
        )}
      </main>
    </div>
  )
}

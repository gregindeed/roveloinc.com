'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import ClientRoster, { type RosterRow } from './ClientRoster'
import FirmMenu from './FirmMenu'
import { useT } from './I18nProvider'

export type FirmLite = { id: string; name: string; isPlatform: boolean }
export type RecentLite = { slug: string; name: string; kind: 'business' | 'individual' }

type Scope = string // 'all' | firmId
type ViewMode = 'firm' | 'attention'
type KindFilter = 'all' | 'business' | 'individual'

const SEVERITY: Record<string, number> = { critical: 0, warning: 1, info: 2 }
const K = { scope: 'rovelo.admin.scope', view: 'rovelo.admin.view', kind: 'rovelo.admin.kind' }

function rowKind(r: RosterRow): 'business' | 'individual' {
  return r.kind === 'individual' ? 'individual' : 'business'
}

// A quiet localStorage read that never throws (private windows, blocked storage).
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writePref(key: string, val: string) {
  try {
    localStorage.setItem(key, val)
  } catch {
    /* non-critical */
  }
}

// ── Segmented control (kind + view toggles) ──────────────────────────────────
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-gray-100 p-0.5 text-[11px] font-medium">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => !active && onChange(o.value)}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Firm scope dropdown ──────────────────────────────────────────────────────
function FirmScope({
  scope,
  firms,
  countByOrg,
  totalCount,
  onChange,
}: {
  scope: Scope
  firms: FirmLite[]
  countByOrg: Record<string, number>
  totalCount: number
  onChange: (s: Scope) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = scope === 'all' ? t('admin.allFirms') : firms.find((f) => f.id === scope)?.name ?? t('admin.allFirms')

  const item = (active: boolean) =>
    `flex items-center justify-between gap-4 w-full px-3 py-2 text-left text-sm transition-colors ${
      active ? 'bg-gray-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
    }`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-400 transition-colors"
      >
        <span
          className="text-xl leading-none"
          style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
        >
          {current}
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 text-gray-400 group-hover:text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-40 py-1">
          <button type="button" role="menuitem" className={item(scope === 'all')} onClick={() => { onChange('all'); setOpen(false) }}>
            <span>{t('admin.allFirms')}</span>
            <span className="text-xs tabular-nums text-gray-400">{totalCount}</span>
          </button>
          <div className="my-1 h-px bg-gray-100" />
          {firms.map((f) => (
            <button key={f.id} type="button" role="menuitem" className={item(scope === f.id)} onClick={() => { onChange(f.id); setOpen(false) }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{f.name}</span>
                {f.isPlatform && <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-600">{t('admin.yourFirm')}</span>}
              </span>
              <span className="text-xs tabular-nums text-gray-400">{countByOrg[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard({
  firms,
  rows,
  sharedRows,
  archivedRows,
  recents,
  viewerRole,
  isPlatform,
}: {
  firms: FirmLite[]
  rows: RosterRow[]
  sharedRows: RosterRow[]
  archivedRows: RosterRow[]
  recents: RecentLite[]
  viewerRole: string | null
  isPlatform: boolean
}) {
  const t = useT()

  const defaultScope: Scope = useMemo(() => firms.find((f) => f.isPlatform)?.id ?? 'all', [firms])
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [view, setView] = useState<ViewMode>('firm')
  const [kind, setKind] = useState<KindFilter>('all')

  // Restore saved preferences after mount (keeps SSR deterministic).
  useEffect(() => {
    const s = readPref(K.scope)
    if (s && (s === 'all' || firms.some((f) => f.id === s))) setScope(s)
    const v = readPref(K.view)
    if (v === 'firm' || v === 'attention') setView(v)
    const kf = readPref(K.kind)
    if (kf === 'all' || kf === 'business' || kf === 'individual') setKind(kf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setScopeP = (s: Scope) => { setScope(s); writePref(K.scope, s) }
  const setViewP = (v: ViewMode) => { setView(v); writePref(K.view, v) }
  const setKindP = (k: KindFilter) => { setKind(k); writePref(K.kind, k) }

  const countByOrg = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rows) if (r.orgId) m[r.orgId] = (m[r.orgId] ?? 0) + 1
    return m
  }, [rows])

  const matchesKind = (r: RosterRow) => kind === 'all' || rowKind(r) === kind
  const inScope = (r: RosterRow) => scope === 'all' || r.orgId === scope
  const rosterMode = kind === 'individual' ? 'individual' : 'mixed'

  const firmsToShow = scope === 'all' ? firms : firms.filter((f) => f.id === scope)

  // When scoped to one firm, the dropdown IS the section title — so we fold the
  // firm's badge, count, and ⋯ menu up beside it and drop the duplicate header.
  const selectedFirm = scope === 'all' ? null : firms.find((f) => f.id === scope) ?? null
  const selectedCount = selectedFirm ? rows.filter((r) => r.orgId === selectedFirm.id && matchesKind(r)).length : 0
  const showFirmMeta = view === 'firm' && !!selectedFirm

  // Attention view: flat, severity-sorted, only accounts that need something.
  const attentionRows = useMemo(() => {
    return rows
      .filter((r) => inScope(r) && matchesKind(r) && r.attention)
      .sort((a, b) => {
        const sa = SEVERITY[a.attention!.level] ?? 3
        const sb = SEVERITY[b.attention!.level] ?? 3
        return sa - sb || a.name.localeCompare(b.name)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scope, kind])

  const kindOptions: { value: KindFilter; label: string }[] = [
    { value: 'all', label: t('admin.filterAll') },
    { value: 'business', label: t('admin.filterBusinesses') },
    { value: 'individual', label: t('admin.filterIndividuals') },
  ]
  const viewOptions: { value: ViewMode; label: string }[] = [
    { value: 'firm', label: t('admin.viewByFirm') },
    { value: 'attention', label: t('admin.viewAttention') },
  ]

  return (
    <div>
      {/* Recently opened */}
      {recents.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-2">{t('admin.recentlyOpened')}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {recents.map((r) => (
              <Link
                key={r.slug}
                href={`/admin/clients/${r.slug}`}
                className="group inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-900 transition-colors max-w-[220px]"
              >
                <span className="truncate">{r.name}</span>
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3 shrink-0 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <FirmScope scope={scope} firms={firms} countByOrg={countByOrg} totalCount={rows.length} onChange={setScopeP} />
          {showFirmMeta && (
            <div className="flex items-center gap-2">
              {selectedFirm!.isPlatform && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">{t('admin.yourFirm')}</span>
              )}
              <span className="text-xs text-gray-400">
                {t(selectedCount === 1 ? 'admin.accountsOne' : 'admin.accountsOther', { n: selectedCount })}
              </span>
              {viewerRole === 'admin' && <FirmMenu firmId={selectedFirm!.id} canManage={isPlatform} />}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={kind} onChange={setKindP} options={kindOptions} />
          <Segmented value={view} onChange={setViewP} options={viewOptions} />
        </div>
      </div>

      {/* Body */}
      {view === 'attention' ? (
        attentionRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">{t('admin.nothingUrgent')}</p>
          </div>
        ) : (
          <div>
            <div className="mb-2 text-sm font-semibold text-gray-900">
              {t('admin.needsAttention')}
              <span className="ml-2 text-xs font-normal text-gray-400">
                {t(attentionRows.length === 1 ? 'admin.accountsOne' : 'admin.accountsOther', { n: attentionRows.length })}
              </span>
            </div>
            <ClientRoster rows={attentionRows} mode={rosterMode} />
          </div>
        )
      ) : (
        <div className="space-y-8">
          {firmsToShow.map((f) => {
            const fr = rows.filter((r) => r.orgId === f.id && matchesKind(r))
            if (fr.length === 0 && scope === 'all') return null
            return (
              <div key={f.id}>
                {/* In "All firms" the per-firm header distinguishes firms. When
                    scoped to one firm the dropdown is the title, so skip it. */}
                {scope === 'all' && (
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {f.name}
                      {f.isPlatform && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">{t('admin.yourFirm')}</span>}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {t(fr.length === 1 ? 'admin.accountsOne' : 'admin.accountsOther', { n: fr.length })}
                      </span>
                    </h2>
                    {viewerRole === 'admin' && <FirmMenu firmId={f.id} canManage={isPlatform} />}
                  </div>
                )}
                {fr.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-gray-400">
                    {kind === 'individual' ? t('admin.noIndividualsHere') : kind === 'business' ? t('admin.noBusinessesHere') : t('admin.noAccounts')}
                  </div>
                ) : (
                  <ClientRoster rows={fr} mode={rosterMode} />
                )}
              </div>
            )
          })}

          {scope === 'all' &&
            (() => {
              const sr = sharedRows.filter(matchesKind)
              if (sr.length === 0) return null
              return (
                <div>
                  <div className="mb-2 text-sm font-semibold text-gray-900">
                    {t('admin.sharedWithYou')}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {t(sr.length === 1 ? 'admin.accountsOne' : 'admin.accountsOther', { n: sr.length })}
                    </span>
                  </div>
                  <ClientRoster rows={sr} mode={rosterMode} />
                </div>
              )
            })()}
        </div>
      )}

      {/* Archived */}
      {archivedRows.length > 0 && (
        <details className="mt-10 group">
          <summary className="cursor-pointer text-sm font-semibold text-gray-500 hover:text-gray-800 select-none">
            {t('admin.archived')} · {archivedRows.length}
          </summary>
          <p className="text-xs text-gray-400 mt-1 mb-3">{t('admin.archivedHint')}</p>
          <div className="opacity-70">
            <ClientRoster rows={archivedRows} />
          </div>
        </details>
      )}
    </div>
  )
}

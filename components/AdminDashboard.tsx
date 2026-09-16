'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ClientRoster, { type RosterRow } from './ClientRoster'
import FirmMenu from './FirmMenu'
import LeadsPanel from './LeadsPanel'
import { useT } from './I18nProvider'
import type { Lead } from '@/lib/leads'

export type FirmLite = { id: string; name: string; isPlatform: boolean }

type Scope = string // 'all' | firmId
// Business and individual accounts are always viewed separately — never mixed
// on the dashboard. "leads" is a third tab: a different data type (the sales
// pipeline), shown in its own table but under the same control.
type TabKind = 'business' | 'individual' | 'leads'
type KindFilter = 'business' | 'individual'

const K = { scope: 'rovelo.admin.scope', kind: 'rovelo.admin.kind' }

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

// ── Tab control: Businesses / Individuals filter the accounts roster; Leads
// switches to the sales-pipeline table. All three are in-place tabs. ──────────
const kindPill = (active: boolean) =>
  `px-2.5 py-1 rounded-full transition-colors ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`

function TabControl({
  tab,
  onTab,
  businessLabel,
  individualLabel,
}: {
  tab: TabKind
  onTab: (t: TabKind) => void
  businessLabel: string
  individualLabel: string
}) {
  const pill = (value: TabKind, text: string) => (
    <button type="button" aria-pressed={tab === value} onClick={() => tab !== value && onTab(value)} className={kindPill(tab === value)}>
      {text}
    </button>
  )
  return (
    <div className="inline-flex items-center rounded-full bg-gray-100 p-0.5 text-[11px] font-medium">
      {pill('business', businessLabel)}
      {pill('individual', individualLabel)}
      {pill('leads', 'Leads')}
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
  viewerRole,
  isPlatform,
  leads,
  canConvertLeads,
  importHref,
  initialTab,
  setLeadStage,
  convertLead,
  deleteLead,
}: {
  firms: FirmLite[]
  rows: RosterRow[]
  sharedRows: RosterRow[]
  archivedRows: RosterRow[]
  viewerRole: string | null
  isPlatform: boolean
  leads: Lead[]
  canConvertLeads: boolean
  importHref: string
  initialTab?: TabKind
  setLeadStage: (leadId: string, formData: FormData) => void | Promise<void>
  convertLead: (leadId: string) => void | Promise<void>
  deleteLead: (leadId: string) => void | Promise<void>
}) {
  const t = useT()

  const defaultScope: Scope = useMemo(() => firms.find((f) => f.isPlatform)?.id ?? 'all', [firms])
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [tab, setTab] = useState<TabKind>(initialTab ?? 'business')
  // Account-kind for the roster branch (leads has its own table).
  const kind: KindFilter = tab === 'leads' ? 'business' : tab
  const isLeads = tab === 'leads'

  // Restore saved preferences after mount (keeps SSR deterministic). An explicit
  // initialTab (e.g. ?tab=leads) wins over the saved tab.
  useEffect(() => {
    const s = readPref(K.scope)
    if (s && (s === 'all' || firms.some((f) => f.id === s))) setScope(s)
    if (!initialTab) {
      const kf = readPref(K.kind)
      if (kf === 'business' || kf === 'individual' || kf === 'leads') setTab(kf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setScopeP = (s: Scope) => { setScope(s); writePref(K.scope, s) }
  const setTabP = (tk: TabKind) => { setTab(tk); writePref(K.kind, tk) }

  const countByOrg = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rows) if (r.orgId) m[r.orgId] = (m[r.orgId] ?? 0) + 1
    return m
  }, [rows])

  const matchesKind = (r: RosterRow) => rowKind(r) === kind
  const rosterMode = kind === 'individual' ? 'individual' : 'mixed'

  const firmsToShow = scope === 'all' ? firms : firms.filter((f) => f.id === scope)

  // When scoped to one firm, the dropdown IS the section title — so we fold the
  // firm's badge, count, and ⋯ menu up beside it and drop the duplicate header.
  const selectedFirm = scope === 'all' ? null : firms.find((f) => f.id === scope) ?? null
  const selectedCount = selectedFirm ? rows.filter((r) => r.orgId === selectedFirm.id && matchesKind(r)).length : 0
  const showFirmMeta = !!selectedFirm

  return (
    <div>
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          {isLeads ? (
            <span className="text-xl leading-none text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Leads
            </span>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabControl tab={tab} onTab={setTabP} businessLabel={t('admin.filterBusinesses')} individualLabel={t('admin.filterIndividuals')} />
        </div>
      </div>

      {/* Body — the leads pipeline, or accounts grouped by firm for the kind. */}
      {isLeads ? (
        <LeadsPanel
          leads={leads}
          canConvert={canConvertLeads}
          importHref={importHref}
          setLeadStage={setLeadStage}
          convertLead={convertLead}
          deleteLead={deleteLead}
        />
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

      {/* Archived — accounts only */}
      {!isLeads && archivedRows.length > 0 && (
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

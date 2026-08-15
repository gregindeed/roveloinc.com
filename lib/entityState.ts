// ── Entity State (pure compute) ──────────────────────────────────────────────
// One derived readiness picture per entity, computed entirely from data we
// already store. No prose — every output is a field you can score, sort, trend,
// and alert on. This is the object the rest of the Overseer writes conclusions
// into. Kept pure (no I/O) so it's testable; the DB gathering lives in
// lib/entityStateServer.ts.

import type { Client } from '@/lib/types'
import { expectedIdentityFields, expectedDocuments } from '@/lib/playbook'

export type Gap = { key: string; label: string }
export type Urgency = 'overdue' | 'high' | 'medium' | 'low'
export type OpenAction = { label: string; urgency: Urgency; kind: string }

export type EntityState = {
  overall: number
  identity: { score: number; have: number; total: number; missing: Gap[] }
  documents: { score: number; have: number; total: number; missing: Gap[] }
  financial: {
    score: number
    monthsCovered: number
    monthsExpected: number
    reconciledShare: number | null
    gaps: string[] // "Mar 2026"
  }
  compliance: {
    score: number
    known: boolean
    overdue: number
    dueSoon: number
    upcoming: number
    done: number
  }
  openActions: OpenAction[]
  lastEvidenceAt: string | null
  computedAt: string
}

export type EntityStateInputs = {
  client: Client
  officersCount: number
  docTypesPresent: string[]
  newestDocAt: string | null
  statements: { period_start: string | null; period_end: string | null; reconciled: boolean | null }[]
  events: { period_label: string | null; due_date: string; status: string }[]
  obligationsCount: number
  todayISO: string // YYYY-MM-DD
  computedAtISO: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (y: number, m: number) => `${y}-${pad(m)}` // m is 1-12
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
const has = (v: unknown) => v != null && String(v).trim() !== ''
const CLOSED = new Set(['paid', 'filed', 'waived'])
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, high: 1, medium: 2, low: 3 }

// Trailing complete months (newest first), bounded to 12 and not before the
// entity's formation month — so a 2-month-old business isn't dinged for the
// 10 months it didn't yet exist.
function expectedMonthKeys(todayISO: string, formationDate: string | null): string[] {
  const [ty, tm] = todayISO.split('-').map(Number)
  // last COMPLETE month = the month before today's month
  let y = ty
  let m = tm - 1
  if (m < 1) {
    m = 12
    y -= 1
  }
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    out.push(monthKey(y, m))
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  if (formationDate && /^\d{4}-\d{2}/.test(formationDate)) {
    const fKey = formationDate.slice(0, 7)
    return out.filter((k) => k >= fKey)
  }
  return out
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function computeEntityState(inp: EntityStateInputs): EntityState {
  const c = inp.client

  // ── Identity completeness ────────────────────────────────────────────────
  const idFields = expectedIdentityFields(c)
  const idMissing: Gap[] = idFields
    .filter((f) => !has((c as unknown as Record<string, unknown>)[f.key as string]))
    .map((f) => ({ key: f.key as string, label: f.label }))
  // Officers/ownership counts as one identity item for formal entities.
  const wantsOfficers = !!c.entity_type && c.entity_type !== 'sole_prop'
  const idTotal = idFields.length + (wantsOfficers ? 1 : 0)
  if (wantsOfficers && inp.officersCount === 0) idMissing.push({ key: 'officers', label: 'Officers / ownership' })
  const idHave = idTotal - idMissing.length
  const identityScore = idTotal === 0 ? 100 : Math.round((idHave / idTotal) * 100)

  // ── Document completeness ────────────────────────────────────────────────
  const docReqs = expectedDocuments(c)
  const present = new Set(inp.docTypesPresent)
  const docMissing: Gap[] = docReqs.filter((d) => !present.has(d.key)).map((d) => ({ key: d.key, label: d.label }))
  const docTotal = docReqs.length
  const docHave = docTotal - docMissing.length
  const documentScore = docTotal === 0 ? 100 : Math.round((docHave / docTotal) * 100)

  // ── Financial coverage ───────────────────────────────────────────────────
  const expectedMonths = expectedMonthKeys(inp.todayISO, c.formation_date)
  const covered = new Set<string>()
  for (const s of inp.statements) {
    if (!s.period_start && !s.period_end) continue
    const startKey = (s.period_start ?? s.period_end ?? '').slice(0, 7)
    const endKey = (s.period_end ?? s.period_start ?? '').slice(0, 7)
    for (const k of expectedMonths) if (k >= startKey && k <= endKey) covered.add(k)
  }
  const monthsExpected = expectedMonths.length
  const monthsCovered = covered.size
  const financialGaps = expectedMonths.filter((k) => !covered.has(k)).map(monthLabel)
  const financialScore = monthsExpected === 0 ? 100 : Math.round((monthsCovered / monthsExpected) * 100)
  const reconciledShare =
    inp.statements.length === 0
      ? null
      : Math.round((inp.statements.filter((s) => s.reconciled).length / inp.statements.length) * 100)

  // ── Compliance posture ───────────────────────────────────────────────────
  const soon = addDays(inp.todayISO, 30)
  let overdue = 0
  let dueSoon = 0
  let upcoming = 0
  let done = 0
  for (const e of inp.events) {
    if (CLOSED.has(e.status)) {
      done += 1
      continue
    }
    if (e.due_date < inp.todayISO) overdue += 1
    else if (e.due_date <= soon) dueSoon += 1
    else upcoming += 1
  }
  const complianceKnown = inp.obligationsCount > 0
  const totalEvents = inp.events.length
  const complianceScore = !complianceKnown || totalEvents === 0 ? 0 : Math.round((1 - overdue / totalEvents) * 100)

  // ── Open actions (ranked) ────────────────────────────────────────────────
  const actions: OpenAction[] = []
  for (const e of inp.events) {
    if (!CLOSED.has(e.status) && e.due_date < inp.todayISO) {
      actions.push({ kind: 'obligation', urgency: 'overdue', label: `Overdue: ${e.period_label ?? 'filing'} (was due ${e.due_date})` })
    }
  }
  for (const g of idMissing) actions.push({ kind: 'identity', urgency: 'high', label: `Add ${g.label}` })
  for (const e of inp.events) {
    if (!CLOSED.has(e.status) && e.due_date >= inp.todayISO && e.due_date <= soon) {
      actions.push({ kind: 'obligation', urgency: 'high', label: `Due soon: ${e.period_label ?? 'filing'} (${e.due_date})` })
    }
  }
  for (const g of docMissing) actions.push({ kind: 'document', urgency: 'medium', label: `Upload ${g.label}` })
  for (const label of financialGaps.slice(0, 3)) actions.push({ kind: 'coverage', urgency: 'medium', label: `Missing ${label} statement` })
  if (!complianceKnown) actions.push({ kind: 'compliance', urgency: 'medium', label: 'Set up the compliance schedule (no obligations enrolled)' })

  actions.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
  const openActions = actions.slice(0, 10)

  // ── Overall (weighted) ───────────────────────────────────────────────────
  // Compliance only counts toward the overall once a schedule exists. For an
  // entity with nothing enrolled yet, "0% compliant" isn't a real gap — it's
  // unknown — so we exclude it and renormalize the remaining weights instead of
  // dragging a brand-new, otherwise-tidy entity's overall down.
  const parts: { score: number; weight: number }[] = [
    { score: identityScore, weight: 0.3 },
    { score: documentScore, weight: 0.25 },
    { score: financialScore, weight: 0.25 },
  ]
  if (complianceKnown) parts.push({ score: complianceScore, weight: 0.2 })
  const weightSum = parts.reduce((a, p) => a + p.weight, 0)
  const overall = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / weightSum)

  return {
    overall,
    identity: { score: identityScore, have: idHave, total: idTotal, missing: idMissing },
    documents: { score: documentScore, have: docHave, total: docTotal, missing: docMissing },
    financial: { score: financialScore, monthsCovered, monthsExpected, reconciledShare, gaps: financialGaps },
    compliance: { score: complianceScore, known: complianceKnown, overdue, dueSoon, upcoming, done },
    openActions,
    lastEvidenceAt: inp.newestDocAt,
    computedAt: inp.computedAtISO,
  }
}

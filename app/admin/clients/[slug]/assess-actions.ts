'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assess, overseerModel } from '@/lib/ai'
import { logEvent, registryDigest } from '@/lib/registryServer'
import type { Client } from '@/lib/types'
import { entityBase } from '@/lib/entityYear'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

const round = (n: number) => Math.round(n * 100) / 100

async function buildOverviewContext(
  supabase: Awaited<ReturnType<typeof admin>>,
  c: Client
) {
  const now = new Date().getFullYear()
  const [
    { data: deposits },
    { data: checking },
    { data: cc },
    { data: obligations },
    { data: events },
    { data: officers },
    { data: documents },
  ] = await Promise.all([
    supabase.from('deposits').select('txn_date, amount').eq('client_id', c.id),
    supabase.from('checking_expenses').select('txn_date, amount').eq('client_id', c.id),
    supabase.from('cc_transactions').select('post_date, amount, personal').eq('client_id', c.id),
    supabase.from('obligations').select('label, agency').eq('client_id', c.id),
    supabase.from('obligation_events').select('due_date, status').eq('client_id', c.id),
    supabase.from('entity_officers').select('ownership_pct').eq('client_id', c.id),
    supabase.from('documents').select('id').eq('client_id', c.id),
  ])

  const yr = (d: string | null) => !!d && d.slice(0, 4) === String(now)
  const income = (deposits ?? []).filter((r) => yr(r.txn_date)).reduce((a, r) => a + Number(r.amount), 0)
  const expenses = (checking ?? []).filter((r) => yr(r.txn_date)).reduce((a, r) => a + Number(r.amount), 0)
  const personal = (cc ?? [])
    .filter((r) => yr(r.post_date) && r.personal)
    .reduce((a, r) => a + Number(r.amount), 0)

  const today = new Date().toISOString().slice(0, 10)
  const openEvents = (events ?? []).filter((e) => e.status !== 'paid' && e.status !== 'filed')
  const overdue = openEvents.filter((e) => e.due_date < today).length
  const upcoming = openEvents.filter((e) => e.due_date >= today).length

  const missing: string[] = []
  if (!c.entity_type) missing.push('entity_type')
  if (!c.ein) missing.push('EIN')
  if (!c.cdtfa_account) missing.push('CDTFA account')
  if (!c.edd_account) missing.push('EDD account')
  if (!c.ca_sos_number) missing.push('CA SOS number')
  if (!c.formation_date) missing.push('formation_date')
  if ((officers ?? []).length === 0) missing.push('officers/ownership')

  return {
    entity: {
      name: c.name,
      entity_type: c.entity_type,
      status: c.status,
      formation_date: c.formation_date,
      ein_present: !!c.ein,
      cdtfa_present: !!c.cdtfa_account,
      edd_present: !!c.edd_account,
      officers_count: (officers ?? []).length,
      ownership_total_pct: (officers ?? []).reduce((a, o) => a + (Number(o.ownership_pct) || 0), 0),
    },
    financials_current_year: {
      year: now,
      total_deposits: round(income),
      total_expenses: round(expenses),
      net: round(income - expenses),
      personal_card_charges_flagged: round(personal),
    },
    compliance: {
      obligations_count: (obligations ?? []).length,
      overdue_items: overdue,
      upcoming_items: upcoming,
      obligations: (obligations ?? []).map((o) => ({ label: o.label, agency: o.agency })),
    },
    documents: { count: (documents ?? []).length },
    missing_fields: missing,
  }
}

const CRITICAL_DOC_TYPES: { key: string; label: string }[] = [
  { key: 'articles', label: 'Articles of Inc./Org.' },
  { key: 'ein_letter', label: 'EIN Letter (CP-575)' },
  { key: 'statement_of_information', label: 'Statement of Information' },
  { key: 'sellers_permit', label: "Seller's Permit" },
  { key: 'business_license', label: 'Business License' },
]

async function buildComplianceContext(
  supabase: Awaited<ReturnType<typeof admin>>,
  c: Client
) {
  const [{ data: obligations }, { data: events }] = await Promise.all([
    supabase.from('obligations').select('*').eq('client_id', c.id),
    supabase.from('obligation_events').select('*').eq('client_id', c.id).order('due_date'),
  ])

  const obs = obligations ?? []
  const evs = events ?? []
  const today = new Date().toISOString().slice(0, 10)
  const open = evs.filter((e) => e.status !== 'paid' && e.status !== 'filed' && e.status !== 'waived')
  const overdue = open
    .filter((e) => e.due_date < today)
    .map((e) => ({ period: e.period_label, due_date: e.due_date, amount_due: e.amount_due }))
  const upcoming = open
    .filter((e) => e.due_date >= today)
    .slice(0, 8)
    .map((e) => ({ period: e.period_label, due_date: e.due_date, amount_due: e.amount_due }))

  const enrolledAgencies = Array.from(new Set(obs.map((o) => o.agency)))

  return {
    entity: { name: c.name, entity_type: c.entity_type, status: c.status },
    obligations_enrolled: obs.map((o) => ({ label: o.label, agency: o.agency, frequency: o.frequency })),
    enrolled_agencies: enrolledAgencies,
    events_total: evs.length,
    overdue_count: overdue.length,
    overdue,
    upcoming_count: open.filter((e) => e.due_date >= today).length,
    upcoming_next: upcoming,
    note:
      obs.length === 0
        ? 'No obligations enrolled yet — the compliance schedule is empty.'
        : undefined,
  }
}

async function buildDocumentsContext(
  supabase: Awaited<ReturnType<typeof admin>>,
  c: Client
) {
  const { data: documents } = await supabase
    .from('documents')
    .select('name, doc_type, agency, issued_date, expires_date')
    .eq('client_id', c.id)

  const docs = documents ?? []
  const today = new Date().toISOString().slice(0, 10)
  const byType: Record<string, number> = {}
  for (const d of docs) byType[d.doc_type] = (byType[d.doc_type] ?? 0) + 1

  const present = new Set(docs.map((d) => d.doc_type))
  const missingCritical = CRITICAL_DOC_TYPES.filter((t) => !present.has(t.key)).map((t) => t.label)

  const expired = docs
    .filter((d) => d.expires_date && d.expires_date < today)
    .map((d) => ({ name: d.name, doc_type: d.doc_type, expired: d.expires_date }))
  const expiringSoon = docs
    .filter((d) => {
      if (!d.expires_date || d.expires_date < today) return false
      const days = (new Date(d.expires_date).getTime() - new Date(today).getTime()) / 86400000
      return days <= 60
    })
    .map((d) => ({ name: d.name, doc_type: d.doc_type, expires: d.expires_date }))

  return {
    entity: { name: c.name, entity_type: c.entity_type },
    documents_total: docs.length,
    count_by_type: byType,
    missing_critical_documents: missingCritical,
    expired_documents: expired,
    expiring_within_60_days: expiringSoon,
  }
}

async function buildContext(
  supabase: Awaited<ReturnType<typeof admin>>,
  c: Client,
  scope: string
) {
  if (scope === 'compliance') return buildComplianceContext(supabase, c)
  if (scope === 'documents') return buildDocumentsContext(supabase, c)
  return buildOverviewContext(supabase, c)
}

export async function generateAssessment(slug: string, scope: string) {
  const supabase = await admin()
  const { data } = await supabase.from('clients').select('*').eq('slug', slug).single()
  if (!data) return
  const c = data as Client

  const scoped = await buildContext(supabase, c, scope)
  const briefing = (c.overseer_context ?? '').trim()
  const digest = await registryDigest(supabase, c.id)
  const context = {
    ...(briefing ? { operator_briefing: briefing } : {}),
    ...(digest.standing_facts.length ? { standing_facts: digest.standing_facts } : {}),
    ...(digest.recent_history.length ? { recent_history: digest.recent_history } : {}),
    ...scoped,
  }

  let content: string
  try {
    content = await assess(scope, context)
  } catch (e) {
    content = `Assessment unavailable: ${e instanceof Error ? e.message : 'unknown error'}`
  }

  await supabase
    .from('ai_assessments')
    .upsert(
      { client_id: c.id, scope, content, model: overseerModel() },
      { onConflict: 'client_id,scope' }
    )
  const sub = scope === 'compliance' || scope === 'documents' ? `/${scope}` : ''
  revalidatePath(`${entityBase(slug)}${sub}`)
}

// Save the human-written briefing the Overseer uses on every read for this entity.
export async function updateOverseerContext(slug: string, context: string) {
  const supabase = await admin()
  const value = context.trim().slice(0, 4000) || null
  const { data: c } = await supabase.from('clients').select('id').eq('slug', slug).single()
  await supabase.from('clients').update({ overseer_context: value }).eq('slug', slug)
  if (c?.id) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await logEvent(supabase, c.id as string, {
      kind: 'context',
      source: 'operator',
      actor: user?.email ?? 'Operator',
      title: value ? 'Updated the Overseer briefing' : 'Cleared the Overseer briefing',
      detail: value ? value.slice(0, 200) : null,
      createdBy: user?.id ?? null,
    })
  }
  revalidatePath(entityBase(slug))
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(`${entityBase(slug)}/documents`)
}

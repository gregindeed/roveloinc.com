'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assess, overseerModel } from '@/lib/ai'
import type { Client } from '@/lib/types'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal')
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

export async function generateAssessment(slug: string, scope: string) {
  const supabase = await admin()
  const { data } = await supabase.from('clients').select('*').eq('slug', slug).single()
  if (!data) return
  const c = data as Client

  // Only 'overview' is wired for now; other scopes reuse the same context.
  const context = await buildOverviewContext(supabase, c)

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
  revalidatePath(`/admin/clients/${slug}`)
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { scanAndMatch } from '@/lib/signalsServer'
import { recomputeBySlug } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'
import { COMPLIANCE_PROFILE, getTemplate } from '@/lib/compliance'
import { entityBase } from '@/lib/entityYear'

async function worker() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`${entityBase(slug)}/compliance?${key}=${encodeURIComponent(msg)}`)

const revalidate = (slug: string) => {
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
}

// Scan the entity's transactions for signals and auto-match obligations.
export async function scanEntitySignals(slug: string) {
  const supabase = await worker()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Entity not found.')
  const r = await scanAndMatch(supabase, client!.id as string)
  revalidate(slug)
  const bits = [
    `${r.evidence} signal${r.evidence === 1 ? '' : 's'} found`,
    r.satisfied ? `${r.satisfied} filing${r.satisfied === 1 ? '' : 's'} auto-marked paid` : '',
    r.proposals ? `${r.proposals} proposal${r.proposals === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  back(slug, 'ok', `Scan complete — ${bits.join(', ')}.`)
}

// Confirm a proposal: turn on the profile toggle and enroll its obligations.
export async function confirmSignal(slug: string, signalId: string) {
  const supabase = await worker()
  const { data: sig } = await supabase
    .from('detected_signals')
    .select('id, client_id, proposed_action')
    .eq('id', signalId)
    .single()
  if (!sig) back(slug, 'warn', 'That suggestion no longer exists.')
  const field = (sig!.proposed_action as { field?: string } | null)?.field
  const toggle = COMPLIANCE_PROFILE.find((p) => p.field === field)
  if (!field || !toggle) back(slug, 'warn', 'This suggestion can’t be applied automatically.')

  const { data: client } = await supabase
    .from('clients')
    .select('id, formation_date, entity_type')
    .eq('id', sig!.client_id)
    .single()
  if (!client) back(slug, 'warn', 'Entity not found.')

  // Flip the profile flag on.
  await supabase.from('clients').update({ [field!]: true }).eq('id', client!.id)

  // Enroll any of the toggle's obligation kinds not already present.
  const { data: existing } = await supabase.from('obligations').select('kind').eq('client_id', client!.id)
  const have = new Set((existing ?? []).map((o) => o.kind as string))
  const year = new Date().getFullYear()
  const formationMonth = client!.formation_date ? Number(String(client!.formation_date).slice(5, 7)) : null
  const isLLC = client!.entity_type === 'llc'

  let added = 0
  for (const kind of toggle!.kinds) {
    if (have.has(kind)) continue
    const tpl = getTemplate(kind)
    if (!tpl) continue
    const { data: ob } = await supabase
      .from('obligations')
      .insert({
        client_id: client!.id,
        agency: tpl.agency,
        kind: tpl.key,
        label: tpl.label,
        frequency: tpl.frequency,
        default_amount: null,
      })
      .select('id')
      .single()
    if (!ob) continue
    const rows = tpl.generate(year, { amount: null, formationMonth, isLLC }).map((e) => ({
      obligation_id: ob.id,
      client_id: client!.id,
      period_label: e.period_label,
      due_date: e.due_date,
      amount_due: e.amount_due,
      status: 'upcoming' as const,
    }))
    if (rows.length) await supabase.from('obligation_events').insert(rows)
    added += 1
  }

  await supabase.from('detected_signals').update({ status: 'applied' }).eq('id', signalId)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await logEvent(supabase, client!.id, {
    kind: 'obligation',
    source: 'operator',
    actor: user?.email ?? 'Operator',
    title: `Enrolled ${toggle!.label} from an Overseer suggestion`,
    detail: `${added} obligation${added === 1 ? '' : 's'} scheduled.`,
    createdBy: user?.id ?? null,
  })
  await recomputeBySlug(supabase, slug)
  revalidate(slug)
  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', `Enrolled ${toggle!.label} — ${added} obligation${added === 1 ? '' : 's'} scheduled.`)
}

export async function dismissSignal(slug: string, signalId: string) {
  const supabase = await worker()
  await supabase.from('detected_signals').update({ status: 'dismissed' }).eq('id', signalId)
  revalidate(slug)
}

// Undo an auto-matched filing: reopen the event and re-open its evidence signal.
export async function undoAutoSatisfy(slug: string, eventId: string) {
  const supabase = await worker()
  const { data: ev } = await supabase
    .from('obligation_events')
    .select('client_id, satisfied_by_txn')
    .eq('id', eventId)
    .single()
  await supabase
    .from('obligation_events')
    .update({ status: 'upcoming', paid_date: null, amount_paid: null, satisfied_by_txn: null, satisfied_auto: false })
    .eq('id', eventId)
  // Re-open the evidence signal that had claimed it.
  const link = ev?.satisfied_by_txn as string | null
  if (ev?.client_id && link && link.includes(':')) {
    const [table, id] = link.split(':')
    await supabase
      .from('detected_signals')
      .update({ status: 'open' })
      .eq('client_id', ev.client_id)
      .eq('source_table', table)
      .eq('source_id', id)
  }
  await recomputeBySlug(supabase, slug)
  revalidate(slug)
}

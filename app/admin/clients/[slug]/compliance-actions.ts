'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTemplate, PROFILE_FIELDS, ALL_PROFILE_KINDS, desiredKinds, isCaliforniaState } from '@/lib/compliance'
import { recomputeAndPersist, recomputeBySlug } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'
import { draftStateCompliance } from '@/lib/ai'
import { getViewer } from '@/lib/auth'
import { entityBase } from '@/lib/entityYear'

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

const back = (slug: string, key: 'ok' | 'warn', msg: string) =>
  redirect(`${entityBase(slug)}/compliance?${key}=${encodeURIComponent(msg)}`)

export async function enrollObligation(slug: string, formData: FormData) {
  const supabase = await requireAdmin()

  const templateKey = String(formData.get('template') || '')
  const year = parseInt(String(formData.get('year') || ''), 10)
  const amountRaw = String(formData.get('amount') || '').trim()
  const amount = amountRaw ? Number(amountRaw) : null

  const tpl = getTemplate(templateKey)
  if (!tpl) back(slug, 'warn', 'Pick a valid obligation.')
  if (!year || year < 2000 || year > 2100) back(slug, 'warn', 'Enter a valid year.')

  const { data: client } = await supabase
    .from('clients')
    .select('id, formation_date, entity_type')
    .eq('slug', slug)
    .single()
  if (!client) back(slug, 'warn', 'Client not found.')

  const formationMonth = client!.formation_date ? Number(client!.formation_date.slice(5, 7)) : null
  const isLLC = client!.entity_type === 'llc'

  const { data: ob, error: obErr } = await supabase
    .from('obligations')
    .insert({
      client_id: client!.id,
      agency: tpl!.agency,
      kind: tpl!.key,
      label: tpl!.label,
      frequency: tpl!.frequency,
      default_amount: amount,
    })
    .select('id')
    .single()
  if (obErr) back(slug, 'warn', `Could not add obligation: ${obErr.message}`)

  const events = tpl!.generate(year, { amount, formationMonth, isLLC })
  const rows = events.map((e) => ({
    obligation_id: ob!.id,
    client_id: client!.id,
    period_label: e.period_label,
    due_date: e.due_date,
    amount_due: e.amount_due,
    status: 'upcoming' as const,
  }))
  if (rows.length) {
    const { error: evErr } = await supabase.from('obligation_events').insert(rows)
    if (evErr) back(slug, 'warn', `Obligation added, but schedule failed: ${evErr.message}`)
  }

  await recomputeAndPersist(supabase, client!.id)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
  back(slug, 'ok', `${tpl!.label} added for ${year} — ${rows.length} scheduled item${rows.length === 1 ? '' : 's'}.`)
}

// Save the entity's compliance profile and reconcile its obligations:
// add missing obligations for enabled toggles, remove ones for disabled toggles.
export async function syncComplianceProfile(slug: string, formData: FormData) {
  const supabase = await requireAdmin()

  const profile: Record<string, boolean> = {}
  for (const f of PROFILE_FIELDS) profile[f] = formData.get(f) === 'on'

  const { data: client } = await supabase
    .from('clients')
    .select('id, formation_date, entity_type')
    .eq('slug', slug)
    .single()
  if (!client) redirect(`/admin/clients/${slug}/account?warn=Client not found`)

  await supabase.from('clients').update(profile).eq('id', client!.id)

  const desired = new Set(desiredKinds(profile))
  const { data: existing } = await supabase
    .from('obligations')
    .select('id, kind')
    .eq('client_id', client!.id)
  const existingByKind = new Map((existing ?? []).map((o) => [o.kind, o.id]))

  const year = new Date().getFullYear()
  const formationMonth = client!.formation_date ? Number(client!.formation_date.slice(5, 7)) : null
  const isLLC = client!.entity_type === 'llc'

  let added = 0
  let removed = 0

  // Add obligations for enabled toggles that aren't enrolled yet.
  for (const kind of desired) {
    if (existingByKind.has(kind)) continue
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
    const events = tpl.generate(year, { amount: null, formationMonth, isLLC })
    const rows = events.map((e) => ({
      obligation_id: ob.id,
      client_id: client!.id,
      period_label: e.period_label,
      due_date: e.due_date,
      amount_due: e.amount_due,
      status: 'upcoming' as const,
    }))
    if (rows.length) await supabase.from('obligation_events').insert(rows)
    added++
  }

  // Remove profile-managed obligations that are no longer enabled.
  for (const [kind, id] of existingByKind) {
    if (ALL_PROFILE_KINDS.includes(kind) && !desired.has(kind)) {
      await supabase.from('obligations').delete().eq('id', id) // cascades to events
      removed++
    }
  }

  await recomputeAndPersist(supabase, client!.id)
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))

  const bits = [added ? `${added} added` : '', removed ? `${removed} removed` : ''].filter(Boolean).join(', ')
  back(slug, 'ok', `Compliance profile saved${bits ? ` — ${bits}` : ''}.`)
}

export async function markEventPaid(slug: string, eventId: string) {
  const supabase = await requireAdmin()
  const { data: ev } = await supabase
    .from('obligation_events')
    .select('amount_due, period_label, client_id')
    .eq('id', eventId)
    .single()
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('obligation_events')
    .update({ status: 'paid', paid_date: today, amount_paid: ev?.amount_due ?? null })
    .eq('id', eventId)
  if (ev?.client_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await logEvent(supabase, ev.client_id as string, {
      kind: 'filing',
      source: 'operator',
      actor: user?.email ?? 'Operator',
      title: `Marked ${ev.period_label ?? 'a filing'} paid`,
      createdBy: user?.id ?? null,
    })
  }
  await recomputeBySlug(supabase, slug)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
}

export async function resetEvent(slug: string, eventId: string) {
  const supabase = await requireAdmin()
  await supabase
    .from('obligation_events')
    .update({ status: 'upcoming', paid_date: null, amount_paid: null })
    .eq('id', eventId)
  await recomputeBySlug(supabase, slug)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
}

export async function removeObligation(slug: string, obligationId: string) {
  const supabase = await requireAdmin()
  await supabase.from('obligations').delete().eq('id', obligationId) // cascades to events
  await recomputeBySlug(supabase, slug)
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
}

// ── Compliance hybrid: draft → confirm → promote ─────────────────────────────

// Ask the Overseer (or a promoted template) to draft this entity's out-of-state
// filing calendar. Everything lands UNVERIFIED so it can't drive a reminder.
export async function draftStateSchedule(slug: string, formData: FormData) {
  const supabase = await requireAdmin()
  const { data: client } = await supabase
    .from('clients')
    .select('id, state, entity_type, formation_date, has_employees, overseer_context')
    .eq('slug', slug)
    .single()
  if (!client) back(slug, 'warn', 'Client not found.')

  const stateInput = String(formData.get('state') || '').trim()
  const state = (stateInput || (client!.state as string | null) || '').trim()
  if (!state) back(slug, 'warn', 'Tell me which state to draft for.')
  if (isCaliforniaState(state)) back(slug, 'warn', 'California is already covered by the built-in schedule.')
  if (stateInput && stateInput !== client!.state) await supabase.from('clients').update({ state: stateInput }).eq('id', client!.id)

  const year = new Date().getFullYear()
  type Drafted = { agency_label: string; kind: string; label: string; frequency: string; events: { period_label: string; due_date: string }[] }
  let drafted: Drafted[] = []
  let note = ''

  // Prefer a promoted template for this state; otherwise ask the Overseer.
  const { data: tpls } = await supabase.from('compliance_state_templates').select('*').eq('state', state)
  const matching = (tpls ?? []).filter((t) => !t.entity_type || t.entity_type === client!.entity_type)
  if (matching.length) {
    drafted = matching.map((t) => ({
      agency_label: t.agency_label as string,
      kind: t.kind as string,
      label: t.label as string,
      frequency: t.frequency as string,
      events: ((t.schedule as { period_label: string; month: number; day: number }[]) ?? []).map((s) => ({
        period_label: String(s.period_label).replace('{year}', String(year)),
        due_date: `${year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`,
      })),
    }))
    note = `Prepared from your saved ${state} template.`
  } else {
    const viewer = await getViewer()
    try {
      const draft = await draftStateCompliance(
        {
          state,
          entity_type: client!.entity_type,
          has_employees: client!.has_employees,
          formation_date: client!.formation_date,
          year,
          business: client!.overseer_context,
        },
        viewer?.locale
      )
      drafted = draft.obligations
      note = draft.note
    } catch {
      back(slug, 'warn', 'The Overseer could not draft a schedule right now — try again shortly.')
    }
  }
  if (!drafted.length) back(slug, 'warn', 'No schedule was drafted — you can add obligations manually.')

  // Clear any prior AI drafts to avoid duplicates.
  await supabase.from('obligations').delete().eq('client_id', client!.id).eq('verified', false).eq('source', 'ai_draft')

  for (const d of drafted) {
    const { data: ob } = await supabase
      .from('obligations')
      .insert({
        client_id: client!.id,
        agency: 'other',
        kind: d.kind,
        label: `${d.agency_label} — ${d.label}`,
        frequency: d.frequency,
        default_amount: null,
        verified: false,
        source: 'ai_draft',
        draft_state: state,
      })
      .select('id')
      .single()
    if (!ob) continue
    const rows = d.events.map((e) => ({
      obligation_id: ob.id,
      client_id: client!.id,
      period_label: e.period_label,
      due_date: e.due_date,
      amount_due: null,
      status: 'upcoming' as const,
      verified: false,
    }))
    if (rows.length) await supabase.from('obligation_events').insert(rows)
  }

  await logEvent(supabase, client!.id as string, {
    kind: 'compliance',
    source: 'overseer',
    actor: 'The Overseer',
    title: `Drafted a ${state} filing calendar for review.`,
    detail: note || null,
  })
  revalidatePath(`${entityBase(slug)}/compliance`)
  back(slug, 'ok', `The Overseer drafted a ${state} schedule below — review and confirm it.`)
}

// Confirm the proposed schedule: it becomes real and starts driving reminders.
export async function confirmDrafts(slug: string) {
  const supabase = await requireAdmin()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Client not found.')
  await supabase.from('obligations').update({ verified: true }).eq('client_id', client!.id).eq('verified', false)
  await supabase.from('obligation_events').update({ verified: true }).eq('client_id', client!.id).eq('verified', false)
  await recomputeAndPersist(supabase, client!.id as string)
  await logEvent(supabase, client!.id as string, {
    kind: 'compliance',
    source: 'operator',
    actor: 'Operator',
    title: 'Confirmed the proposed filing schedule.',
    detail: null,
  })
  revalidatePath(`${entityBase(slug)}/compliance`)
  revalidatePath(entityBase(slug))
  back(slug, 'ok', 'Schedule confirmed — it now drives reminders and readiness.')
}

// Discard the proposed schedule.
export async function dismissDrafts(slug: string) {
  const supabase = await requireAdmin()
  const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Client not found.')
  await supabase.from('obligations').delete().eq('client_id', client!.id).eq('verified', false).eq('source', 'ai_draft')
  revalidatePath(`${entityBase(slug)}/compliance`)
  back(slug, 'ok', 'Dismissed the proposed schedule.')
}

// Promote the (confirmed) drafted schedule into a reusable state template.
// Platform-only — Rovelo curates the shared template library.
export async function promoteDraftsToTemplate(slug: string) {
  const supabase = await requireAdmin()
  const viewer = await getViewer()
  if (!viewer?.isPlatform) back(slug, 'warn', 'Only Rovelo can save a shared state template.')
  const { data: client } = await supabase.from('clients').select('id, entity_type').eq('slug', slug).single()
  if (!client) back(slug, 'warn', 'Client not found.')

  const { data: obs } = await supabase
    .from('obligations')
    .select('id, kind, label, frequency, default_amount, draft_state')
    .eq('client_id', client!.id)
    .eq('source', 'ai_draft')
    .not('draft_state', 'is', null)
  if (!obs?.length) back(slug, 'warn', 'No drafted schedule to promote.')

  const { data: evs } = await supabase
    .from('obligation_events')
    .select('obligation_id, period_label, due_date')
    .eq('client_id', client!.id)
  const evByOb = new Map<string, { period_label: string; due_date: string }[]>()
  for (const e of evs ?? []) {
    const a = evByOb.get(e.obligation_id as string) ?? []
    a.push({ period_label: e.period_label as string, due_date: e.due_date as string })
    evByOb.set(e.obligation_id as string, a)
  }

  const year = String(new Date().getFullYear())
  const state = obs![0].draft_state as string
  const rows = obs!.map((o) => {
    const [agency, ...rest] = (o.label as string).split(' — ')
    const filing = rest.length ? rest.join(' — ') : (o.label as string)
    const schedule = (evByOb.get(o.id as string) ?? []).map((e) => {
      const [, m, d] = e.due_date.split('-')
      return { period_label: e.period_label.replace(year, '{year}'), month: Number(m), day: Number(d) }
    })
    return {
      state,
      entity_type: client!.entity_type,
      agency_label: agency,
      kind: o.kind,
      label: filing,
      frequency: o.frequency,
      default_amount: o.default_amount,
      schedule,
      created_by: viewer!.userId,
    }
  })
  const { error } = await supabase.from('compliance_state_templates').insert(rows)
  if (error) back(slug, 'warn', `Could not save template: ${error.message}`)
  revalidatePath(`${entityBase(slug)}/compliance`)
  back(slug, 'ok', `Saved as the ${state} template — future ${state} entities will draft from it.`)
}

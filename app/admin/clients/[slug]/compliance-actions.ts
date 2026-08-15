'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTemplate, PROFILE_FIELDS, ALL_PROFILE_KINDS, desiredKinds } from '@/lib/compliance'
import { recomputeAndPersist, recomputeBySlug } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'

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
  redirect(`/admin/clients/${slug}/compliance?${key}=${encodeURIComponent(msg)}`)

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
  revalidatePath(`/admin/clients/${slug}/compliance`)
  revalidatePath(`/admin/clients/${slug}`)
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
  revalidatePath(`/admin/clients/${slug}/compliance`)
  revalidatePath(`/admin/clients/${slug}`)

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
  revalidatePath(`/admin/clients/${slug}/compliance`)
  revalidatePath(`/admin/clients/${slug}`)
}

export async function resetEvent(slug: string, eventId: string) {
  const supabase = await requireAdmin()
  await supabase
    .from('obligation_events')
    .update({ status: 'upcoming', paid_date: null, amount_paid: null })
    .eq('id', eventId)
  await recomputeBySlug(supabase, slug)
  revalidatePath(`/admin/clients/${slug}/compliance`)
  revalidatePath(`/admin/clients/${slug}`)
}

export async function removeObligation(slug: string, obligationId: string) {
  const supabase = await requireAdmin()
  await supabase.from('obligations').delete().eq('id', obligationId) // cascades to events
  await recomputeBySlug(supabase, slug)
  revalidatePath(`/admin/clients/${slug}/compliance`)
  revalidatePath(`/admin/clients/${slug}`)
}

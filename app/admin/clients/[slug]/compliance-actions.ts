'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTemplate } from '@/lib/compliance'

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal')
  return supabase
}

const back = (slug: string, key: 'ok' | 'warn', msg: string) =>
  redirect(`/admin/clients/${slug}?${key}=${encodeURIComponent(msg)}`)

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

  revalidatePath(`/admin/clients/${slug}`)
  back(slug, 'ok', `${tpl!.label} added for ${year} — ${rows.length} scheduled item${rows.length === 1 ? '' : 's'}.`)
}

export async function markEventPaid(slug: string, eventId: string) {
  const supabase = await requireAdmin()
  const { data: ev } = await supabase
    .from('obligation_events')
    .select('amount_due')
    .eq('id', eventId)
    .single()
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('obligation_events')
    .update({ status: 'paid', paid_date: today, amount_paid: ev?.amount_due ?? null })
    .eq('id', eventId)
  revalidatePath(`/admin/clients/${slug}`)
}

export async function resetEvent(slug: string, eventId: string) {
  const supabase = await requireAdmin()
  await supabase
    .from('obligation_events')
    .update({ status: 'upcoming', paid_date: null, amount_paid: null })
    .eq('id', eventId)
  revalidatePath(`/admin/clients/${slug}`)
}

export async function removeObligation(slug: string, obligationId: string) {
  const supabase = await requireAdmin()
  await supabase.from('obligations').delete().eq('id', obligationId) // cascades to events
  revalidatePath(`/admin/clients/${slug}`)
}

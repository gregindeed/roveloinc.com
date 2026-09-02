'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logEvent } from '@/lib/registryServer'

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return { supabase, user }
}

const back = (slug: string, year: number | null, key: 'ok' | 'warn', msg: string) =>
  redirect(year ? `/admin/clients/${slug}/${year}?${key}=${encodeURIComponent(msg)}` : `/admin/clients/${slug}?${key}=${encodeURIComponent(msg)}`)

async function clientBySlug(supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'], slug: string) {
  const { data } = await supabase.from('clients').select('id, name').eq('slug', slug).single()
  return data as { id: string; name: string } | null
}

// Open a new tax year for this entity.
export async function openYear(slug: string, formData: FormData) {
  const { supabase } = await requireAdmin()
  const year = parseInt(String(formData.get('year') || ''), 10)
  if (!year || year < 2000 || year > 2100) back(slug, null, 'warn', 'Pick a valid tax year.')
  const client = await clientBySlug(supabase, slug)
  if (!client) back(slug, null, 'warn', 'Account not found.')

  const { error } = await supabase.from('client_years').insert({ client_id: client!.id, year, status: 'active' })
  // 23505 = already exists; treat as a no-op success (just switch to it).
  if (error && error.code !== '23505') back(slug, null, 'warn', `Could not open ${year}: ${error.message}`)
  if (!error) {
    await logEvent(supabase, client!.id, {
      kind: 'year',
      source: 'operator',
      actor: 'Operator',
      title: `Opened tax year ${year}.`,
      detail: null,
    })
  }
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, year, 'ok', `Tax year ${year} is open.`)
}

// Close a tax year — locks it read-only.
export async function closeYear(slug: string, year: number) {
  const { supabase, user } = await requireAdmin()
  const client = await clientBySlug(supabase, slug)
  if (!client) back(slug, null, 'warn', 'Account not found.')
  await supabase
    .from('client_years')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: user.id })
    .eq('client_id', client!.id)
    .eq('year', year)
  await logEvent(supabase, client!.id, {
    kind: 'year',
    source: 'operator',
    actor: 'Operator',
    title: `Closed tax year ${year}.`,
    detail: 'The year is locked read-only. A manager can reopen it.',
  })
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, year, 'ok', `Tax year ${year} is closed and locked.`)
}

// Reopen a closed tax year.
export async function reopenYear(slug: string, year: number) {
  const { supabase } = await requireAdmin()
  const client = await clientBySlug(supabase, slug)
  if (!client) back(slug, null, 'warn', 'Account not found.')
  await supabase
    .from('client_years')
    .update({ status: 'active', closed_at: null, closed_by: null })
    .eq('client_id', client!.id)
    .eq('year', year)
  await logEvent(supabase, client!.id, {
    kind: 'year',
    source: 'operator',
    actor: 'Operator',
    title: `Reopened tax year ${year}.`,
    detail: null,
  })
  revalidatePath(`/admin/clients/${slug}`)
  back(slug, year, 'ok', `Tax year ${year} is open again.`)
}

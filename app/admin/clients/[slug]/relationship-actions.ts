'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const back = (slug: string, key: 'ok' | 'warn', msg: string): never =>
  redirect(`/admin/clients/${slug}/account?${key}=${encodeURIComponent(msg)}`)

async function currentClient(supabase: ReturnType<typeof createClient>, slug: string) {
  const { data } = await supabase.from('clients').select('id, kind').eq('slug', slug).single()
  return data as { id: string; kind: string | null } | null
}

// Search clients that can be linked to this one. From a business we look for
// people (individuals); from a person we look for businesses. RLS scopes the
// results to what the viewer may see.
export async function searchLinkableClients(
  slug: string,
  query: string
): Promise<{ id: string; name: string; kind: string }[]> {
  await requireAdmin()
  const q = query.trim()
  if (q.length < 2) return []
  const supabase = createClient()
  const cur = await currentClient(supabase, slug)
  if (!cur) return []
  const opposite = cur.kind === 'individual' ? 'business' : 'individual'
  const { data } = await supabase
    .from('clients')
    .select('id, name, kind')
    .eq('kind', opposite)
    .ilike('name', `%${q}%`)
    .neq('id', cur.id)
    .limit(8)
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, kind: (c.kind as string) ?? 'business' }))
}

// Link a person to an entity (or vice-versa). person_id is always the
// individual, entity_id the business, regardless of which side you're on.
export async function linkRelationship(slug: string, counterpartId: string, formData: FormData) {
  await requireAdmin()
  const supabase = createClient()
  const cur = await currentClient(supabase, slug)
  if (!cur) back(slug, 'warn', 'Entity not found.')

  const role = String(formData.get('role') || 'owner').trim() || 'owner'
  const pctRaw = String(formData.get('ownership_pct') || '').trim()
  const pct = pctRaw ? Number(pctRaw) : null

  const isIndividual = cur!.kind === 'individual'
  const personId = isIndividual ? cur!.id : counterpartId
  const entityId = isIndividual ? counterpartId : cur!.id

  const { error } = await supabase
    .from('client_relationships')
    .upsert({ person_id: personId, entity_id: entityId, role, ownership_pct: pct }, { onConflict: 'person_id,entity_id,role' })
  if (error) back(slug, 'warn', `Could not link: ${error.message}`)

  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', 'Relationship added.')
}

export async function unlinkRelationship(slug: string, relId: string) {
  await requireAdmin()
  const supabase = createClient()
  const { error } = await supabase.from('client_relationships').delete().eq('id', relId)
  if (error) back(slug, 'warn', `Could not remove: ${error.message}`)
  revalidatePath(`/admin/clients/${slug}/account`)
  back(slug, 'ok', 'Relationship removed.')
}

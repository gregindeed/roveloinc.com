'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logEvent } from '@/lib/registryServer'

async function worker() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return { supabase, user }
}

const rev = (slug: string) => {
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`/admin/clients/${slug}`)
}

// Operator writes a note or a pinned "standing fact" into the registry.
export async function addRegistryNote(slug: string, formData: FormData) {
  const { supabase, user } = await worker()
  const text = String(formData.get('text') ?? '').trim()
  if (!text) return
  const pinned = formData.get('pinned') === 'on'

  const { data: c } = await supabase.from('clients').select('id').eq('slug', slug).single()
  if (!c?.id) return
  await logEvent(supabase, c.id as string, {
    kind: pinned ? 'fact' : 'note',
    source: 'operator',
    actor: user.email ?? 'Operator',
    title: text.slice(0, 400),
    pinned,
    createdBy: user.id,
  })
  rev(slug)
}

export async function togglePin(slug: string, entryId: string) {
  const { supabase } = await worker()
  const { data: e } = await supabase.from('entity_log').select('pinned').eq('id', entryId).single()
  if (!e) return
  await supabase.from('entity_log').update({ pinned: !e.pinned }).eq('id', entryId)
  rev(slug)
}

// Only operator-authored notes/facts can be removed — system/overseer events are
// an immutable record.
export async function deleteRegistryEntry(slug: string, entryId: string) {
  const { supabase } = await worker()
  await supabase.from('entity_log').delete().eq('id', entryId).eq('source', 'operator')
  rev(slug)
}

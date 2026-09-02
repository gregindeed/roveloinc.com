'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { recomputeBySlug } from '@/lib/entityStateServer'
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

// Recompute the entity's readiness picture and persist a snapshot. Called by the
// manual "Recompute" button now, and by the on-upload orchestrator (Brick B).
export async function recomputeEntityState(slug: string) {
  const supabase = await worker()
  await recomputeBySlug(supabase, slug)
  revalidatePath(entityBase(slug))
}

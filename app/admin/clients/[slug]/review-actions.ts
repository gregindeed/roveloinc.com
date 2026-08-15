'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { recomputeBySlug } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'
import { ENTITY_FIELD_LABELS } from '@/lib/types'

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

const revalidate = (slug: string) => {
  revalidatePath(`/admin/clients/${slug}/account`)
  revalidatePath(`/admin/clients/${slug}`)
}

// Approve a queued extraction: write the value AND mark it verified so no later
// AI guess can silently overwrite it.
export async function approveReview(slug: string, reviewId: string) {
  const supabase = await worker()
  const { data: r } = await supabase
    .from('field_reviews')
    .select('client_id, field, proposed_value, confidence, source_doc_id, status')
    .eq('id', reviewId)
    .single()
  if (!r || r.status !== 'pending') return

  await supabase.from('clients').update({ [r.field as string]: r.proposed_value }).eq('id', r.client_id)
  await supabase.from('entity_field_meta').upsert(
    {
      client_id: r.client_id,
      field: r.field,
      source_doc_id: r.source_doc_id,
      confidence: r.confidence,
      verified: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,field' }
  )
  await supabase.from('field_reviews').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', reviewId)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  await logEvent(supabase, r.client_id as string, {
    kind: 'verified',
    source: 'operator',
    actor: user?.email ?? 'Operator',
    title: `Verified ${ENTITY_FIELD_LABELS[r.field as string] ?? r.field}: ${r.proposed_value}`,
    createdBy: user?.id ?? null,
  })

  await recomputeBySlug(supabase, slug)
  revalidate(slug)
}

export async function rejectReview(slug: string, reviewId: string) {
  const supabase = await worker()
  await supabase
    .from('field_reviews')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', reviewId)
    .eq('status', 'pending')
  revalidate(slug)
}

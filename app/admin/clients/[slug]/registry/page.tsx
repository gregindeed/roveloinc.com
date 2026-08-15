import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OverviewCommand from '@/components/OverviewCommand'
import RegistryPanel from '@/components/RegistryPanel'
import { gatherAndCompute, persistState } from '@/lib/entityStateServer'
import type { Client, EntityLogEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function RegistryPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const c = client as Client

  const [{ data: assessment }, { data: logEntries }] = await Promise.all([
    supabase
      .from('ai_assessments')
      .select('content, model, created_at')
      .eq('client_id', c.id)
      .eq('scope', 'overview')
      .maybeSingle(),
    supabase.from('entity_log').select('*').eq('client_id', c.id).order('at', { ascending: false }).limit(200),
  ])

  // The readiness picture + Overseer read live here now. Recomputing on view keeps
  // the durable snapshot (and the clients roster) fresh.
  const state = await gatherAndCompute(supabase, c)
  await persistState(supabase, c.id, state)

  return (
    <div className="space-y-6">
      <OverviewCommand slug={c.slug} state={state} assessment={assessment} context={c.overseer_context} />
      <RegistryPanel slug={c.slug} entries={(logEntries ?? []) as EntityLogEntry[]} />
    </div>
  )
}

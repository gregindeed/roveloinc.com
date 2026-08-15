import { createClient } from '@/lib/supabase/server'
import CompliancePanel from '@/components/CompliancePanel'
import type { Obligation, ObligationEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function PortalCompliance() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user!.id)
    .single()
  if (!profile?.client_id) return null

  const { data: client } = await supabase
    .from('clients')
    .select('slug')
    .eq('id', profile.client_id)
    .single()

  const [{ data: obligations }, { data: events }] = await Promise.all([
    supabase.from('obligations').select('*').order('created_at'),
    supabase.from('obligation_events').select('*').order('due_date'),
  ])

  return (
    <CompliancePanel
      slug={client?.slug ?? ''}
      obligations={(obligations ?? []) as Obligation[]}
      events={(events ?? []) as ObligationEvent[]}
      isAdmin={false}
    />
  )
}

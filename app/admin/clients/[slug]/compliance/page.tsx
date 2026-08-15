import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompliancePanel from '@/components/CompliancePanel'
import SignalsPanel from '@/components/SignalsPanel'
import DocIntakePanel from '@/components/DocIntakePanel'
import { AGENCY_FOLDER } from '@/lib/folders'
import type { Client, Obligation, ObligationEvent, DocumentRow, DetectedSignal } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function CompliancePage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { ok?: string; warn?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: clientRow } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!clientRow) notFound()
  const client = clientRow as Client

  const [{ data: obligations }, { data: events }, { data: notices }, { data: signals }] = await Promise.all([
    supabase.from('obligations').select('*').eq('client_id', client.id).order('created_at'),
    supabase.from('obligation_events').select('*').eq('client_id', client.id).order('due_date'),
    supabase
      .from('documents')
      .select('*')
      .eq('client_id', client.id)
      .eq('folder', AGENCY_FOLDER)
      .order('created_at', { ascending: false }),
    supabase
      .from('detected_signals')
      .select('*')
      .eq('client_id', client.id)
      .eq('status', 'open')
      .like('type', 'propose_%')
      .order('created_at', { ascending: false }),
  ])

  const eventRows = (events ?? []) as ObligationEvent[]
  const autoSatisfied = eventRows.filter((e) => e.satisfied_auto)

  return (
    <div className="space-y-6">
      {searchParams.ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
          {searchParams.ok}
        </div>
      )}
      {searchParams.warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {searchParams.warn}
        </div>
      )}
      <SignalsPanel slug={client.slug} proposals={(signals ?? []) as DetectedSignal[]} satisfied={autoSatisfied} />

      <CompliancePanel
        slug={client.slug}
        obligations={(obligations ?? []) as Obligation[]}
        events={eventRows}
        isAdmin={true}
      />

      {(notices?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notices &amp; Correspondence</h2>
          <DocIntakePanel
            slug={client.slug}
            clientId={client.id}
            currentUserId={user!.id}
            isAdmin={true}
            folder={AGENCY_FOLDER}
            initialDocs={(notices ?? []) as DocumentRow[]}
            readOnly
            current={{
              legal_name: client.legal_name,
              entity_type: client.entity_type,
              ein: client.ein,
              ca_sos_number: client.ca_sos_number,
              cdtfa_account: client.cdtfa_account,
              edd_account: client.edd_account,
              ftb_id: client.ftb_id,
              formation_date: client.formation_date,
              naics_code: client.naics_code,
              address: client.address,
            }}
          />
        </div>
      )}
    </div>
  )
}

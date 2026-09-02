import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompliancePanel from '@/components/CompliancePanel'
import ComplianceDraftPanel, { type DraftObligation } from '@/components/ComplianceDraftPanel'
import SignalsPanel from '@/components/SignalsPanel'
import DocIntakePanel from '@/components/DocIntakePanel'
import { AGENCY_FOLDER } from '@/lib/folders'
import { getViewer } from '@/lib/auth'
import { isCaliforniaState } from '@/lib/compliance'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import type { Client, Obligation, ObligationEvent, DocumentRow, DetectedSignal } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function CompliancePage({
  params,
  searchParams,
}: {
  params: { slug: string; year: string }
  searchParams: { ok?: string; warn?: string }
}) {
  const locale = getLocale()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: clientRow } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!clientRow) notFound()
  const client = clientRow as Client & { state?: string | null }
  const viewer = await getViewer()

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

  const allObs = (obligations ?? []) as (Obligation & { verified?: boolean })[]
  const allEvents = (events ?? []) as (ObligationEvent & { verified?: boolean })[]

  // Verified = the real schedule (drives reminders). Unverified = the Overseer's
  // proposed draft, held for review.
  const verifiedObs = allObs.filter((o) => o.verified !== false)
  const verifiedEvents = allEvents.filter((e) => e.verified !== false)
  const draftObs = allObs.filter((o) => o.verified === false)
  const draftEventsByOb = new Map<string, ObligationEvent[]>()
  for (const e of allEvents.filter((e) => e.verified === false)) {
    const a = draftEventsByOb.get(e.obligation_id) ?? []
    a.push(e)
    draftEventsByOb.set(e.obligation_id, a)
  }
  const drafts: DraftObligation[] = draftObs.map((o) => ({
    id: o.id,
    label: o.label,
    frequency: o.frequency,
    events: (draftEventsByOb.get(o.id) ?? []).map((e) => ({ id: e.id, period_label: e.period_label, due_date: e.due_date })),
  }))

  const eventRows = verifiedEvents
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

      <ComplianceDraftPanel
        slug={client.slug}
        state={client.state ?? null}
        isCalifornia={!!client.state && isCaliforniaState(client.state)}
        drafts={drafts}
        isPlatform={!!viewer?.isPlatform}
      />

      <CompliancePanel slug={client.slug} obligations={verifiedObs} events={eventRows} isAdmin={true} />

      {(notices?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t(locale, 'compliance.noticesTitle')}</h2>
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

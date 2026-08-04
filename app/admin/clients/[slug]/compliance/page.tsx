import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CompliancePanel from '@/components/CompliancePanel'
import type { Obligation, ObligationEvent } from '@/lib/types'

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
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const [{ data: obligations }, { data: events }] = await Promise.all([
    supabase.from('obligations').select('*').eq('client_id', client.id).order('created_at'),
    supabase.from('obligation_events').select('*').eq('client_id', client.id).order('due_date'),
  ])

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
      <CompliancePanel
        slug={client.slug}
        obligations={(obligations ?? []) as Obligation[]}
        events={(events ?? []) as ObligationEvent[]}
        isAdmin={true}
        currentYear={new Date().getFullYear()}
      />
    </div>
  )
}

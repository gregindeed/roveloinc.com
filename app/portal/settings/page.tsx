import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Client } from '@/lib/types'
import { ENTITY_TYPE_LABELS, type EntityType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Settings — Rovelo Inc', robots: { index: false, follow: false } }

const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : '—')

export default async function PortalSettings() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user!.id).single()
  if (!profile?.client_id) return null

  const { data: client } = await supabase.from('clients').select('*').eq('id', profile.client_id).single()
  const c = client as Client

  // Bank-feed status. plaid_items is service-role-only (holds the access token),
  // so we fetch ONLY safe columns for this client's own entity. client_id was
  // just resolved from the user's own RLS session, so there's no cross-tenant risk.
  const admin = createAdminClient()
  const { data: feeds } = await admin
    .from('plaid_items')
    .select('id, institution_name, status, last_synced_at')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })
  const connections = (feeds ?? []) as { id: string; institution_name: string | null; status: string | null; last_synced_at: string | null }[]

  const typeLabel = c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type as EntityType] : '—'

  return (
    <div className="space-y-6">
      {/* Business details */}
      <section className="rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Business details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Business name" value={dash(c.name)} />
          <Field label="Legal name" value={dash(c.legal_name)} />
          <Field label="Entity type" value={typeLabel} />
          <Field label="EIN" value={dash(c.ein)} />
          <Field label="Formation date" value={dash(c.formation_date)} />
          <Field label="Fiscal year end" value={dash(c.fiscal_year_end)} />
          <Field label="Address" value={dash(c.address)} />
          <Field label="Phone" value={dash(c.phone)} />
          <Field label="Email" value={dash(c.email)} />
        </dl>
        <p className="text-xs text-gray-400 mt-4">
          Need a correction? Send Rovelo Inc the update and we&apos;ll adjust your record.
        </p>
      </section>

      {/* Bank feed */}
      <section className="rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Bank feed</h2>
        {connections.length > 0 ? (
          <ul className="space-y-2">
            {connections.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{f.institution_name ?? 'Connected bank'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {f.last_synced_at ? `Last synced ${new Date(f.last_synced_at).toLocaleDateString('en-US')}` : 'Awaiting first sync'}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                    f.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {f.status === 'active' ? 'Connected' : (f.status ?? 'Needs attention')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center">
            <p className="text-sm text-gray-600">No bank feed connected yet.</p>
            <p className="text-xs text-gray-500 mt-1">
              Connecting your bank lets transactions flow in automatically. Contact Rovelo Inc to set it up securely.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PropertyAddressInput from '@/components/PropertyAddressInput'
import { getViewer } from '@/lib/auth'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@/lib/property'
import { createProperty, createOwner } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'New property — Rovelo Inc',
  robots: { index: false, follow: false },
}

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'
const summaryCls = 'cursor-pointer text-[13px] font-medium text-gray-700 hover:text-gray-900 select-none'

export default async function NewProperty({ searchParams }: { searchParams: { error?: string; ok?: string; owner?: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  if (viewer && viewer.role !== 'admin' && viewer.role !== 'collaborator') {
    return null
  }
  const canCreateOwner = viewer?.role === 'admin'

  // Owner entities the viewer can attach a property to (RLS scopes the list).
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, owner_name, kind')
    .is('archived_at', null)
    .order('name')
  const clients = (clientRows ?? []) as { id: string; name: string; owner_name: string | null; kind: string | null }[]
  const preselect = searchParams.owner && clients.some((c) => c.id === searchParams.owner) ? searchParams.owner : ''

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Properties" email={user?.email} settingsHref={null} />
      <main className="max-w-xl mx-auto px-6 py-10">
        <Link href="/admin/properties" className="text-xs text-gray-500 hover:text-gray-900">
          ← Properties
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          New property
        </h1>
        <p className="mt-1 text-sm text-gray-500">A property belongs to an owner — one of your entities (a business or an individual). That keeps its books, access, and portal in sync with everything else.</p>

        {searchParams.ok && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{searchParams.ok}</div>
        )}
        {searchParams.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
        )}

        {/* Add a new owner inline */}
        {canCreateOwner && (
          <details className="mt-6 rounded-xl border border-dashed border-gray-200 p-4" open={clients.length === 0}>
            <summary className={summaryCls}>+ Owner not listed? Add one</summary>
            <form action={createOwner} className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={label} htmlFor="owner_new_name">Owner / entity name</label>
                <input id="owner_new_name" name="name" required placeholder="Rovelo Holdings LLC" className={input} />
              </div>
              <div>
                <label className={label} htmlFor="owner_new_kind">Type</label>
                <select id="owner_new_kind" name="kind" className={input} defaultValue="business">
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="owner_new_contact">Contact / owner name</label>
                <input id="owner_new_contact" name="owner_name" placeholder="optional" className={input} />
              </div>
              <div className="col-span-2">
                <button type="submit" className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
                  Add owner
                </button>
                <span className="ml-3 text-[11px] text-gray-400">Creates a real entity — it also appears in your clients roster.</span>
              </div>
            </form>
          </details>
        )}

        {clients.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">
              No owner entities yet. {canCreateOwner ? 'Add one above' : 'Ask an admin to add one'}, then create the property.
            </p>
          </div>
        ) : (
          <form action={createProperty} className="mt-6 space-y-4">
            <div>
              <label className={label} htmlFor="client_id">Owner (landlord entity)</label>
              <select id="client_id" name="client_id" required className={input} defaultValue={preselect}>
                <option value="" disabled>Choose an owner…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.owner_name ? ` · ${c.owner_name}` : ''}
                    {c.kind === 'individual' ? ' (individual)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="name">Property name</label>
              <input id="name" name="name" required placeholder="Maple Street Duplex" className={input} />
            </div>

            {/* Google Places autocomplete → captures lat/lng/place_id + auto photo */}
            <PropertyAddressInput labelClassName={label} inputClassName={input} />

            <div>
              <label className={label} htmlFor="type">Type</label>
              <select id="type" name="type" className={input} defaultValue="residential">
                {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((k) => (
                  <option key={k} value={k}>
                    {PROPERTY_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" rows={3} placeholder="Anything worth remembering about this property." className={input} />
              <p className="text-[11px] text-gray-400 mt-1">The Overseer reads these notes into the owner&apos;s profile.</p>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
                Create property
              </button>
              <Link href="/admin/properties" className="text-sm text-gray-500 hover:text-gray-900">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}

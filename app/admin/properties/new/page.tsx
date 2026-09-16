import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PropertyAddressInput from '@/components/PropertyAddressInput'
import UnitModeFields from '@/components/UnitModeFields'
import OwnerCombobox from '@/components/OwnerCombobox'
import { getViewer } from '@/lib/auth'
import { canUsePropertyModule } from '@/lib/propertyAccess'
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@/lib/property'
import { createProperty, createOwner } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'New property — Rovelo Inc',
  robots: { index: false, follow: false },
}

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

export default async function NewProperty({ searchParams }: { searchParams: { error?: string; ok?: string; owner?: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  if (viewer && viewer.role !== 'admin' && viewer.role !== 'collaborator') {
    return null
  }
  if (!(await canUsePropertyModule(viewer))) redirect('/admin')
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
      <AuthHeader label="Property Management" email={user?.email} settingsHref={null} />
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

        {/* Owner picker (typeahead) lives outside the property form and feeds it
            client_id via the `form` attribute, so its inline "add owner" form
            never nests inside the property form. */}
        <div className="mt-6">
          <OwnerCombobox
            clients={clients}
            canCreateOwner={canCreateOwner}
            preselectId={preselect}
            createOwner={createOwner}
            formId="new-property-form"
            labelClassName={label}
            inputClassName={input}
          />
        </div>

        <form id="new-property-form" action={createProperty} className="mt-4 space-y-4">
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

          <UnitModeFields />

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
      </main>
    </div>
  )
}

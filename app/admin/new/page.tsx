import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { requireAdmin } from '@/lib/auth'
import { ENTITY_TYPE_LABELS, type Organization } from '@/lib/types'
import { CHART_TEMPLATES, DEFAULT_TEMPLATE_KEY } from '@/lib/coa'
import { NameSlugFields, OwnersField, AddressAutocomplete } from '@/components/OnboardingFields'
import { createClientAccount } from './actions'

const selectCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'New account — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function NewClient({
  searchParams,
}: {
  searchParams: { error?: string; org?: string }
}) {
  const viewer = await requireAdmin() // managers/owner only — not collaborators
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Platform super-admins choose which firm the client belongs to.
  let firms: Organization[] = []
  if (viewer.isPlatform) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('is_platform', { ascending: false })
      .order('name')
    firms = (data ?? []) as Organization[]
  }

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref={viewer.isOwner ? '/admin/team' : null} />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All accounts
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">Onboard a new account</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          Sets up the entity and seeds its books. A portal login is optional — add it now or later.
        </p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={createClientAccount} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Business
            </legend>
            {viewer.isPlatform && firms.length > 1 && (
              <div>
                <label htmlFor="org_id" className="block text-xs font-medium text-gray-700 mb-1">
                  Firm
                </label>
                <select
                  id="org_id"
                  name="org_id"
                  defaultValue={
                    firms.some((f) => f.id === searchParams.org)
                      ? searchParams.org
                      : firms.find((f) => f.is_platform)?.id ?? firms[0]?.id ?? ''
                  }
                  className={selectCls}
                >
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.is_platform ? ' (your firm)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Which firm manages this client.</p>
              </div>
            )}
            <NameSlugFields />
            <OwnersField />
            <AddressAutocomplete />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              How they operate
            </legend>
            <div>
              <label htmlFor="entity_type" className="block text-xs font-medium text-gray-700 mb-1">
                Business type
              </label>
              <select id="entity_type" name="entity_type" defaultValue="" className={selectCls}>
                <option value="">— Not sure yet —</option>
                {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">You can set or change this later on the Profile sheet.</p>
            </div>
            <div>
              <label htmlFor="accounting_method" className="block text-xs font-medium text-gray-700 mb-1">
                Accounting basis
              </label>
              <select id="accounting_method" name="accounting_method" defaultValue="cash" className={selectCls}>
                <option value="cash">Cash basis (recommended)</option>
                <option value="accrual">Accrual basis</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Cash = counted when money moves; accrual = when earned/incurred. Changeable later in settings.
              </p>
            </div>
            <div>
              <label htmlFor="template" className="block text-xs font-medium text-gray-700 mb-1">
                Chart of accounts
              </label>
              <select id="template" name="template" defaultValue={DEFAULT_TEMPLATE_KEY} className={selectCls}>
                {Object.values(CHART_TEMPLATES).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Seeds their starting accounts. Rename, add, or hide any of them later.
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Client login <span className="font-normal normal-case text-gray-400">· optional</span>
            </legend>
            <Field
              name="email"
              label="Portal email"
              type="email"
              placeholder="owner@acme.com"
              hint="Optional. Add it to invite them to the client portal now, or leave blank and invite later from Entity settings → Portal access."
            />
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
            >
              Onboard account
            </button>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required,
  hint,
  placeholder,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  hint?: string
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

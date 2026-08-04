import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { updateEntity } from './actions'
import { ENTITY_TYPE_LABELS, type Client, type EntityType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function EditEntity({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!data) notFound()
  const c = data as Client

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href={`/admin/clients/${c.slug}`} className="text-xs text-gray-500 hover:text-gray-900">
          ← {c.name}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">Entity profile</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          The details that make this client&apos;s bookkeeping entity-aware.
        </p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={updateEntity.bind(null, c.slug)} className="space-y-6">
          <Section title="Business">
            <Field name="name" label="Business name" defaultValue={c.name} required />
            <Field name="legal_name" label="Legal name" defaultValue={c.legal_name} />
            <Field name="owner_name" label="Owner name" defaultValue={c.owner_name} />
            <Field name="address" label="Address" defaultValue={c.address} />
            <div className="grid grid-cols-2 gap-3">
              <Field name="phone" label="Phone" defaultValue={c.phone} />
              <Field name="email" label="Email" type="email" defaultValue={c.email} />
            </div>
          </Section>

          <Section title="Entity & tax">
            <div className="grid grid-cols-2 gap-3">
              <Select
                name="entity_type"
                label="Entity type"
                defaultValue={c.entity_type ?? ''}
                options={Object.entries(ENTITY_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
              <Field name="ein" label="EIN" placeholder="XX-XXXXXXX" defaultValue={c.ein} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field name="formation_date" label="Formation date" type="date" defaultValue={c.formation_date} />
              <Field name="fiscal_year_end" label="Fiscal year-end (MM-DD)" placeholder="12-31" defaultValue={c.fiscal_year_end} />
            </div>
            <Field name="naics_code" label="NAICS code" defaultValue={c.naics_code} />
          </Section>

          <Section title="California agency accounts">
            <Field name="cdtfa_account" label="CDTFA account (seller's permit)" defaultValue={c.cdtfa_account} />
            <div className="grid grid-cols-2 gap-3">
              <Field name="edd_account" label="EDD account (payroll)" defaultValue={c.edd_account} />
              <Field name="ca_sos_number" label="CA SOS number" defaultValue={c.ca_sos_number} />
            </div>
            <Field name="ftb_id" label="FTB entity ID" defaultValue={c.ftb_id} />
          </Section>

          <Section title="Status & notes">
            <Select
              name="status"
              label="Status"
              defaultValue={c.status ?? 'active'}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
            <div>
              <label htmlFor="notes" className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={c.notes ?? ''}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
              />
            </div>
          </Section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 transition-colors"
            >
              Save profile
            </button>
            <Link href={`/admin/clients/${c.slug}`} className="text-sm text-gray-500 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{title}</legend>
      {children}
    </fieldset>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required,
  placeholder,
  defaultValue,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string | null
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
        defaultValue={defaultValue ?? ''}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
      />
    </div>
  )
}

function Select({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

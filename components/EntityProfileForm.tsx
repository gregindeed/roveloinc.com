import { updateEntity, addOfficer, deleteOfficer } from '@/app/admin/clients/[slug]/edit/actions'
import { ENTITY_TYPE_LABELS, type Client, type Officer } from '@/lib/types'

export default function EntityProfileForm({ c, officers }: { c: Client; officers: Officer[] }) {
  return (
    <div className="max-w-2xl space-y-8">
      <form action={updateEntity.bind(null, c.slug)} className="space-y-6">
        <Section title="Business">
          <Field name="name" label="Business name" defaultValue={c.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Field name="legal_name" label="Legal name" defaultValue={c.legal_name} />
            <Field name="dba" label="DBA / trade name" defaultValue={c.dba} />
          </div>
          <Field name="owner_name" label="Owner name" defaultValue={c.owner_name} />
          <Field name="address" label="Business address" defaultValue={c.address} />
          <Field name="mailing_address" label="Mailing address (if different)" defaultValue={c.mailing_address} />
          <div className="grid grid-cols-3 gap-3">
            <Field name="phone" label="Phone" defaultValue={c.phone} />
            <Field name="email" label="Email" type="email" defaultValue={c.email} />
            <Field name="website" label="Website" defaultValue={c.website} />
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
          <div className="grid grid-cols-3 gap-3">
            <Field name="naics_code" label="NAICS code" defaultValue={c.naics_code} />
            <Select
              name="accounting_method"
              label="Accounting method"
              defaultValue={c.accounting_method ?? ''}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'accrual', label: 'Accrual' },
              ]}
            />
            <Field name="employee_count" label="Employees" type="number" defaultValue={c.employee_count?.toString()} />
          </div>
        </Section>

        <Section title="California agency accounts">
          <Field name="cdtfa_account" label="CDTFA account (seller's permit)" defaultValue={c.cdtfa_account} />
          <div className="grid grid-cols-3 gap-3">
            <Field name="edd_account" label="EDD account (payroll)" defaultValue={c.edd_account} />
            <Field name="ca_sos_number" label="CA SOS number" defaultValue={c.ca_sos_number} />
            <Field name="ftb_id" label="FTB entity ID" defaultValue={c.ftb_id} />
          </div>
        </Section>

        <Section title="Registered agent">
          <Field name="registered_agent" label="Agent name" defaultValue={c.registered_agent} />
          <Field name="registered_agent_address" label="Agent address" defaultValue={c.registered_agent_address} />
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

        <button
          type="submit"
          className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
        >
          Save profile
        </button>
      </form>

      {/* Officers & ownership */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Officers &amp; ownership</h2>
        {officers.length > 0 && (
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {officers.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{o.name}</span>
                  {o.title && <span className="text-gray-500"> · {o.title}</span>}
                  {o.ownership_pct != null && <span className="text-gray-500"> · {o.ownership_pct}%</span>}
                </div>
                <form action={deleteOfficer.bind(null, c.slug, o.id)}>
                  <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}
        <form action={addOfficer.bind(null, c.slug)} className="flex flex-wrap items-end gap-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <Mini name="name" label="Name" required />
          <Mini name="title" label="Title" placeholder="President, Member…" />
          <Mini name="ownership_pct" label="Ownership %" type="number" width="w-24" />
          <Mini name="email" label="Email" type="email" />
          <Mini name="phone" label="Phone" width="w-32" />
          <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">Add</button>
        </form>
      </div>
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
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function Mini({
  name,
  label,
  type = 'text',
  required,
  placeholder,
  width = 'w-40',
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  width?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={`${width} border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white`}
      />
    </label>
  )
}

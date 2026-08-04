import { ENTITY_TYPE_LABELS, type Client, type Officer } from '@/lib/types'

function Val({ v }: { v: string | number | null | undefined }) {
  if (v === null || v === undefined || v === '') return <span className="text-gray-300">—</span>
  return <span className="text-gray-900 font-medium break-words">{v}</span>
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm mt-0.5">
        <Val v={value} />
      </dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h3>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">{children}</dl>
    </div>
  )
}

export default function EntityProfile({ c, officers }: { c: Client; officers: Officer[] }) {
  const entityType = c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type] : null
  const method =
    c.accounting_method === 'cash' ? 'Cash' : c.accounting_method === 'accrual' ? 'Accrual' : c.accounting_method
  const totalPct = officers.reduce((a, o) => a + (Number(o.ownership_pct) || 0), 0)

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-6">
      <Group title="Identity">
        <Field label="Legal name" value={c.legal_name} />
        <Field label="DBA / trade name" value={c.dba} />
        <Field label="Entity type" value={entityType} />
        <Field label="Formation date" value={c.formation_date} />
        <Field label="CA SOS #" value={c.ca_sos_number} />
        <Field label="Status" value={c.status} />
      </Group>

      <Group title="Tax accounts">
        <Field label="EIN (IRS)" value={c.ein} />
        <Field label="CDTFA (seller's permit)" value={c.cdtfa_account} />
        <Field label="EDD (payroll)" value={c.edd_account} />
        <Field label="FTB entity ID" value={c.ftb_id} />
        <Field label="NAICS code" value={c.naics_code} />
        <Field label="Fiscal year-end" value={c.fiscal_year_end} />
      </Group>

      <Group title="Contact">
        <Field label="Business address" value={c.address} />
        <Field label="Mailing address" value={c.mailing_address} />
        <Field label="Phone" value={c.phone} />
        <Field label="Email" value={c.email} />
        <Field label="Website" value={c.website} />
      </Group>

      <Group title="Registered agent">
        <Field label="Agent name" value={c.registered_agent} />
        <Field label="Agent address" value={c.registered_agent_address} />
      </Group>

      <Group title="Accounting">
        <Field label="Method" value={method} />
        <Field label="Employees" value={c.employee_count} />
      </Group>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Officers &amp; ownership
          </h3>
          {officers.length > 0 && (
            <span className={`text-[11px] ${Math.round(totalPct) === 100 ? 'text-gray-400' : 'text-amber-700'}`}>
              Total {totalPct}%
            </span>
          )}
        </div>
        {officers.length === 0 ? (
          <p className="text-xs text-gray-300">None added — add officers &amp; ownership in Edit profile.</p>
        ) : (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
            {officers.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{o.name}</span>
                  {o.title && <span className="text-gray-500"> · {o.title}</span>}
                </div>
                <div className="text-gray-600 tabular-nums">
                  {o.ownership_pct != null ? `${o.ownership_pct}%` : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

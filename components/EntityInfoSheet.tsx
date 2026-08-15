'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEntityField } from '@/app/admin/clients/[slug]/edit/actions'
import { ENTITY_TYPE_LABELS } from '@/lib/types'

type FieldType = 'text' | 'date' | 'number' | 'select' | 'textarea'
type Option = { value: string; label: string }
type FieldDef = { name: string; label: string; type?: FieldType; options?: Option[] }

const ENTITY_OPTS: Option[] = Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Identity',
    fields: [
      { name: 'name', label: 'Business name' },
      { name: 'legal_name', label: 'Legal name' },
      { name: 'dba', label: 'DBA / trade name' },
      { name: 'owner_name', label: 'Owner name' },
      { name: 'entity_type', label: 'Entity type', type: 'select', options: ENTITY_OPTS },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ] },
      { name: 'formation_date', label: 'Formation date', type: 'date' },
      { name: 'fiscal_year_end', label: 'Fiscal year-end' },
    ],
  },
  {
    title: 'Tax accounts',
    fields: [
      { name: 'ein', label: 'EIN (IRS)' },
      { name: 'cdtfa_account', label: 'CDTFA (seller’s permit)' },
      { name: 'edd_account', label: 'EDD (payroll)' },
      { name: 'ca_sos_number', label: 'CA SOS number' },
      { name: 'ftb_id', label: 'FTB entity ID' },
      { name: 'naics_code', label: 'NAICS code' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { name: 'address', label: 'Business address' },
      { name: 'mailing_address', label: 'Mailing address' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email' },
      { name: 'website', label: 'Website' },
    ],
  },
  {
    title: 'Registered agent',
    fields: [
      { name: 'registered_agent', label: 'Agent name' },
      { name: 'registered_agent_address', label: 'Agent address' },
    ],
  },
  {
    title: 'Accounting',
    fields: [
      { name: 'accounting_method', label: 'Accounting method', type: 'select', options: [
        { value: 'cash', label: 'Cash' },
        { value: 'accrual', label: 'Accrual' },
      ] },
      { name: 'employee_count', label: 'Employees', type: 'number' },
    ],
  },
  { title: 'Notes', fields: [{ name: 'notes', label: 'Notes', type: 'textarea' }] },
]

const inputCls =
  'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export default function EntityInfoSheet({
  slug,
  entityName,
  data,
  canEdit = true,
}: {
  slug: string
  entityName: string
  data: Record<string, string | number | null>
  canEdit?: boolean
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const g of GROUPS) for (const f of g.fields) v[f.name] = data[f.name] == null ? '' : String(data[f.name])
    return v
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  function display(f: FieldDef): string {
    const raw = values[f.name]
    if (!raw) return '—'
    if (f.type === 'select') return f.options?.find((o) => o.value === raw)?.label ?? raw
    return raw
  }

  function startEdit(f: FieldDef) {
    setEditing(f.name)
    setDraft(values[f.name] ?? '')
  }

  async function save(f: FieldDef) {
    setBusy(true)
    try {
      await updateEntityField(slug, f.name, draft)
      setValues((prev) => ({ ...prev, [f.name]: draft }))
      setEditing(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-card border border-gray-200 rounded-xl">
      <div className="no-print flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{entityName}</h2>
          <p className="text-[11px] text-gray-400">Entity information sheet</p>
        </div>
        <button
          onClick={() => window.print()}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
        >
          Download PDF
        </button>
      </div>

      <div className="sheet-body p-5 space-y-5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{g.title}</div>
            <div className="divide-y divide-gray-50">
              {g.fields.map((f) => (
                <div key={f.name} className="flex items-start gap-3 py-1.5">
                  <span className="text-xs text-gray-500 w-40 shrink-0 pt-0.5">{f.label}</span>
                  {editing === f.name && canEdit ? (
                    <div className="flex-1 flex items-center gap-2">
                      {f.type === 'select' ? (
                        <select value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls}>
                          <option value="">—</option>
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className={inputCls} />
                      ) : (
                        <input
                          type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className={inputCls}
                          autoFocus
                        />
                      )}
                      <button onClick={() => save(f)} disabled={busy} className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900">
                        Save
                      </button>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-700">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-gray-900 flex-1 min-w-0 break-words">{display(f)}</span>
                      {canEdit && (
                        <button
                          onClick={() => startEdit(f)}
                          aria-label={`Edit ${f.label}`}
                          className="no-print text-gray-300 hover:text-gray-700 pt-0.5"
                        >
                          <PencilIcon />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      </div>
    </>
  )
}

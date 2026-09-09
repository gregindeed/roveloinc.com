'use client'

import { setDeductions } from '@/app/admin/clients/[slug]/[year]/income-actions'
import type { TaxDeductions } from '@/lib/income'

const inputCls =
  'border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-full'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

function Field({ name, label, value, note }: { name: string; label: string; value: number; note?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} inputMode="decimal" defaultValue={value ? String(value) : ''} className={inputCls} />
      {note && <p className="text-[11px] text-gray-400 mt-1">{note}</p>}
    </div>
  )
}

export default function DeductionsPanel({
  slug,
  year,
  deductions,
}: {
  slug: string
  year: number
  deductions: TaxDeductions
}) {
  const d = deductions
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900">Itemized deductions &amp; credits</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">
        Enter itemized amounts — the Planning tab uses the greater of these or the standard deduction. Medical counts only above
        7.5% of AGI, and state &amp; local taxes are capped (SALT). Credits are applied as a total against the tax.
      </p>
      <form action={setDeductions.bind(null, slug, year)} className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field name="medical" label="Medical expenses" value={d.medical} note="before the 7.5% floor" />
          <Field name="state_local_taxes" label="State & local taxes" value={d.state_local_taxes} note="SALT — capped" />
          <Field name="mortgage_interest" label="Mortgage interest" value={d.mortgage_interest} />
          <Field name="charitable" label="Charitable gifts" value={d.charitable} />
          <Field name="other_itemized" label="Other itemized" value={d.other_itemized} />
          <Field name="estimated_credits" label="Tax credits" value={d.estimated_credits} note="total, applied against tax" />
        </div>
        <button className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800">
          Save deductions
        </button>
      </form>
    </div>
  )
}

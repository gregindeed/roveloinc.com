'use client'

import { useState } from 'react'
import { setTaxProfile } from '@/app/admin/clients/[slug]/tax-profile-actions'

const inputCls =
  'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

export default function TaxProfilePanel({
  slug,
  residency,
  taxIdType,
  treatyCountry,
  treatyDividendRate,
}: {
  slug: string
  residency: 'resident' | 'nonresident' | null
  taxIdType: 'ssn' | 'itin' | null
  treatyCountry: string | null
  treatyDividendRate: number | null
}) {
  const [res, setRes] = useState<'resident' | 'nonresident'>(residency ?? 'resident')
  const isNR = res === 'nonresident'

  return (
    <div className="border border-gray-200 rounded-xl p-5 max-w-2xl">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Tax profile</h2>
      <p className="text-xs text-gray-500 mb-4">
        How this person files — the basis, ID type, and any tax-treaty rate. This drives the federal estimate on the Planning
        tab. A nonresident (1040-NR) gets no standard deduction, and US-source dividends are taxed at a flat 30% unless a treaty
        reduces it.
      </p>

      <form action={setTaxProfile.bind(null, slug)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Residency basis</label>
            <select name="residency" value={res} onChange={(e) => setRes(e.target.value as 'resident' | 'nonresident')} className={`${inputCls} w-full`}>
              <option value="resident">Resident — Form 1040</option>
              <option value="nonresident">Nonresident — Form 1040-NR</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Files with</label>
            <select name="tax_id_type" defaultValue={taxIdType ?? ''} className={`${inputCls} w-full`}>
              <option value="">—</option>
              <option value="ssn">SSN</option>
              <option value="itin">ITIN</option>
            </select>
          </div>
        </div>

        {isNR && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg bg-gray-50 border border-gray-100 p-3">
            <div>
              <label className={labelCls}>Treaty country</label>
              <input
                name="treaty_country"
                defaultValue={treatyCountry ?? ''}
                placeholder="MX"
                maxLength={2}
                className={`${inputCls} w-full uppercase`}
              />
            </div>
            <div>
              <label className={labelCls}>Treaty dividend rate</label>
              <div className="relative">
                <input
                  name="treaty_dividend_rate"
                  defaultValue={treatyDividendRate != null ? String(Math.round(treatyDividendRate * 100)) : ''}
                  placeholder="10"
                  inputMode="decimal"
                  className={`${inputCls} w-full pr-7`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Blank = statutory 30%. US–Mexico is 10% for a ≥10% shareholder.</p>
            </div>
          </div>
        )}

        <button className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800">
          Save tax profile
        </button>
      </form>
    </div>
  )
}

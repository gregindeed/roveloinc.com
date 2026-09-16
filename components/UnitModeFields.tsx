'use client'

import { useState } from 'react'

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

// Onboarding choice: a single-family/one-rental property (we auto-create its one
// unit + capture beds/baths/sqft/rent here) vs a multi-unit building (units are
// added afterward). Submits `multi_unit` as '0' | '1' via a hidden input.
export default function UnitModeFields() {
  const [multi, setMulti] = useState(false)

  const seg = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
    }`

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Property setup</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMulti(false)} className={seg(!multi)}>
            Single unit
          </button>
          <button type="button" onClick={() => setMulti(true)} className={seg(multi)}>
            Multiple units
          </button>
        </div>
        <input type="hidden" name="multi_unit" value={multi ? '1' : '0'} />
        <p className="text-[11px] text-gray-400 mt-1">
          {multi
            ? "Multi-family / building — you'll add each unit (its own beds/baths/rent) after creating it."
            : 'Single-family / one rental — enter the home details here; no separate units to manage.'}
        </p>
      </div>

      {!multi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={label} htmlFor="bedrooms">Beds</label>
            <input id="bedrooms" name="bedrooms" inputMode="decimal" placeholder="1" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="bathrooms">Baths</label>
            <input id="bathrooms" name="bathrooms" inputMode="decimal" placeholder="1" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="sqft">Sqft</label>
            <input id="sqft" name="sqft" inputMode="numeric" placeholder="640" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="market_rent">Market rent</label>
            <input id="market_rent" name="market_rent" inputMode="decimal" placeholder="772" className={input} />
          </div>
        </div>
      )}
    </div>
  )
}

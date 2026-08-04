'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PeriodBar({ years }: { years: number[] }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()

  const year = sp.get('year') ?? String(years[0])
  const q = sp.get('q')
  const month = sp.get('month')
  const day = sp.get('day')

  function apply(next: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') p.delete(k)
      else p.set(k, v)
    }
    router.push(`${path}?${p.toString()}`)
  }

  const isFullYear = !q && !month && !day
  const btn = (active: boolean) =>
    `px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
      active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`
  const inputCls =
    'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'

  return (
    <div className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
      <select value={year} onChange={(e) => apply({ year: e.target.value })} className={inputCls}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg p-0.5">
        <button className={btn(isFullYear)} onClick={() => apply({ q: null, month: null, day: null })}>
          Full year
        </button>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            className={btn(q === String(n) && !month && !day)}
            onClick={() => apply({ q: String(n), month: null, day: null })}
          >
            Q{n}
          </button>
        ))}
      </div>

      <select
        value={month ?? ''}
        onChange={(e) => apply({ month: e.target.value || null, q: null, day: null })}
        className={inputCls}
      >
        <option value="">Month…</option>
        {MON.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={day ?? ''}
        onChange={(e) => apply({ day: e.target.value || null, q: null, month: null })}
        className={inputCls}
      />

      {!isFullYear && (
        <button
          onClick={() => apply({ q: null, month: null, day: null })}
          className="text-xs text-gray-400 hover:text-gray-700 ml-auto"
        >
          Reset
        </button>
      )}
    </div>
  )
}

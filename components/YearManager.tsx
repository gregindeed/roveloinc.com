'use client'

import { useState, useTransition } from 'react'
import { useT } from '@/components/I18nProvider'
import { openYear, closeYear, reopenYear } from '@/app/admin/clients/[slug]/year-actions'
import type { ClientYear } from '@/lib/yearsServer'

const ghost = 'text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40'

export default function YearManager({
  slug,
  years,
  selectedYear,
  canManage,
}: {
  slug: string
  years: ClientYear[]
  selectedYear: number
  canManage: boolean
}) {
  const t = useT()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const maxYear = years.length ? Math.max(...years.map((y) => y.year)) : new Date().getFullYear()
  const [newYear, setNewYear] = useState(String(maxYear + 1))

  const current = years.find((y) => y.year === selectedYear)
  const isClosed = current?.status === 'closed'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">{t('year.taxYear')}</span>
          <span className="text-sm font-medium text-gray-900">{selectedYear}</span>
          {isClosed && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 border border-gray-300 rounded-full px-2 py-0.5">
              {t('year.closed')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {canManage &&
            (isClosed ? (
              <button onClick={() => start(() => reopenYear(slug, selectedYear))} disabled={pending} className={ghost}>
                {t('year.reopen')}
              </button>
            ) : (
              <button onClick={() => start(() => closeYear(slug, selectedYear))} disabled={pending} className={ghost}>
                {t('year.close')}
              </button>
            ))}

          {canManage &&
            (adding ? (
              <div className="flex items-center gap-2">
                <input
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  inputMode="numeric"
                  className="w-20 border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
                <button
                  onClick={() => start(() => { const fd = new FormData(); fd.set('year', newYear); return openYear(slug, fd) })}
                  disabled={pending || !newYear.trim()}
                  className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-40"
                >
                  {t('year.open')}
                </button>
                <button onClick={() => setAdding(false)} className={ghost}>
                  {t('year.cancel')}
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className={ghost}>
                {t('year.openYear')}
              </button>
            ))}
        </div>
      </div>

      {isClosed && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs text-gray-600">
          {t('year.closedBanner')}
        </div>
      )}
    </div>
  )
}

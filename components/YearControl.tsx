'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useT } from '@/components/I18nProvider'
import { openYear, closeYear, reopenYear } from '@/app/admin/clients/[slug]/year-actions'
import type { ClientYear } from '@/lib/yearsServer'

// A compact year chip that replaces the old "TAX YEAR 2026 … Close year" band.
// One control: shows the active year, switches between years (which wasn't
// possible before), and holds close/reopen + open-a-new-year in its menu.
export default function YearControl({
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const maxYear = years.length ? Math.max(...years.map((y) => y.year)) : new Date().getFullYear()
  const [newYear, setNewYear] = useState(String(maxYear + 1))

  const current = years.find((y) => y.year === selectedYear)
  const isClosed = current?.status === 'closed'
  const sorted = [...years].sort((a, b) => b.year - a.year)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'flex items-center justify-between gap-3 w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <span className="tabular-nums">{selectedYear}</span>
        {isClosed && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 border border-gray-300 rounded-full px-1.5 py-px">
            {t('year.closed')}
          </span>
        )}
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 z-40 overflow-hidden">
          <div className="py-1 max-h-56 overflow-y-auto">
            {sorted.map((y) => {
              const active = y.year === selectedYear
              return (
                <Link
                  key={y.year}
                  href={`/admin/clients/${slug}/${y.year}`}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="tabular-nums">{y.year}</span>
                  {y.status === 'closed' && <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('year.closed')}</span>}
                </Link>
              )
            })}
          </div>

          {canManage && (
            <div className="border-t border-gray-100 py-1">
              {isClosed ? (
                <button onClick={() => start(() => reopenYear(slug, selectedYear))} disabled={pending} className={item}>
                  {t('year.reopen')}
                </button>
              ) : (
                <button onClick={() => start(() => closeYear(slug, selectedYear))} disabled={pending} className={item}>
                  {t('year.close')} {selectedYear}
                </button>
              )}

              {adding ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    inputMode="numeric"
                    autoFocus
                    className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                  <button
                    onClick={() => start(() => { const fd = new FormData(); fd.set('year', newYear); return openYear(slug, fd) })}
                    disabled={pending || !newYear.trim()}
                    className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-40"
                  >
                    {t('year.open')}
                  </button>
                  <button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-700">
                    {t('year.cancel')}
                  </button>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className={item}>
                  {t('year.openYear')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

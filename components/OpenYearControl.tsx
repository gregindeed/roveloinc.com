'use client'

import { useState, useTransition } from 'react'
import { useT } from '@/components/I18nProvider'
import { openYear } from '@/app/admin/clients/[slug]/year-actions'

export default function OpenYearControl({ slug, nextYear }: { slug: string; nextYear: number }) {
  const t = useT()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(String(nextYear))

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
        + {t('year.openYear')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={year}
        onChange={(e) => setYear(e.target.value)}
        inputMode="numeric"
        className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
      />
      <button
        onClick={() => start(() => { const fd = new FormData(); fd.set('year', year); return openYear(slug, fd) })}
        disabled={pending || !year.trim()}
        className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-40"
      >
        {t('year.open')} →
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-900">
        {t('year.cancel')}
      </button>
    </div>
  )
}

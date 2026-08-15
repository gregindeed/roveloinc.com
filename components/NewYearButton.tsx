'use client'

import { useState } from 'react'
import { createDocYear } from '@/app/admin/clients/[slug]/doc-actions'

export default function NewYearButton({ slug, year }: { slug: string; year: number }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Add year"
        title="Add year"
        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    )
  }

  return (
    <form action={createDocYear.bind(null, slug)} className="flex items-center gap-1">
      <input
        name="year"
        type="number"
        defaultValue={year}
        min={2000}
        max={year + 1}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      <button className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700 px-1">
        Cancel
      </button>
    </form>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'

export type RosterRow = {
  id: string
  slug: string
  name: string
  sub: string
  typeLabel: string | null
  ein: string | null
  status: string | null
  readiness?: number
  overdue: number
  enrolled: boolean
  attention?: { level: 'critical' | 'warning' | 'info'; reasons: string[] }
}

// Surface = neutral identity only. No scores, no severity colors — an entity's
// name is never "stamped" as deficient. Everything evaluative lives in the
// expand, which you open by choice.
const COLS = 'grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function ReadinessLine({ score }: { score: number | undefined }) {
  if (score == null) return null
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] text-gray-400 w-16">Readiness</span>
      <div className="h-[3px] w-28 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${score < 50 ? 'bg-red-300' : 'bg-gray-400'}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-gray-400">{score}%</span>
    </div>
  )
}

export default function ClientRoster({ rows }: { rows: RosterRow[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className={`${COLS} px-4 py-2 bg-gray-50/70 border-b border-gray-200`}>
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Account</div>
        <div className="hidden md:block text-[10px] font-medium uppercase tracking-wide text-gray-400">Type</div>
        <div className="hidden md:block text-[10px] font-medium uppercase tracking-wide text-gray-400">EIN</div>
        <div />
      </div>

      {rows.map((c) => {
        const isOpen = !!open[c.id]
        const dissolved = c.status && c.status !== 'active'
        return (
          <div key={c.id} className="border-b border-gray-100 last:border-0">
            <Link href={`/admin/clients/${c.slug}`} className={`${COLS} px-4 py-2.5 hover:bg-gray-50 transition-colors`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-900 truncate">{c.name}</span>
                  {dissolved && <span className="text-[10px] text-gray-400 capitalize">· {c.status}</span>}
                </div>
                <div className="text-[11px] text-gray-400 truncate">{c.sub}</div>
              </div>
              <div className="hidden md:block text-xs text-gray-500">
                {c.typeLabel ?? <span className="text-gray-300">—</span>}
              </div>
              <div className="hidden md:block text-xs text-gray-500 tabular-nums">
                {c.ein ?? <span className="text-gray-300">—</span>}
              </div>
              <button
                type="button"
                aria-label={isOpen ? 'Hide details' : 'Show details'}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggle(c.id)
                }}
                className="justify-self-end p-1 -m-1 rounded hover:bg-gray-100"
              >
                <Chevron open={isOpen} />
              </button>
            </Link>

            {isOpen && (
              <div className="px-4 pb-3.5 pt-0.5 md:pl-4">
                <ReadinessLine score={c.readiness} />
                {c.attention ? (
                  <ul className="space-y-1 mb-2.5">
                    {c.attention.reasons.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-gray-300" />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 mb-2.5">Nothing outstanding.</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  <Link href={`/admin/clients/${c.slug}`} className="font-medium text-gray-900 hover:underline">
                    Open books →
                  </Link>
                  <Link href={`/admin/clients/${c.slug}/compliance`} className="text-gray-400 hover:text-gray-900">
                    Compliance
                  </Link>
                  <Link href={`/admin/clients/${c.slug}/documents`} className="text-gray-400 hover:text-gray-900">
                    Documents
                  </Link>
                  <Link href={`/admin/clients/${c.slug}/account`} className="text-gray-400 hover:text-gray-900">
                    Settings
                  </Link>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

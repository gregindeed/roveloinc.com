'use client'

import Link from 'next/link'
import AvatarStack from './AvatarStack'
import { useT } from '@/components/I18nProvider'
import type { PresenceUser } from '@/lib/presenceServer'

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
  presence?: PresenceUser[]
  year?: number | null
  // Firm this entity belongs to, and whether it's a person or a business — used
  // by the dashboard control bar to scope and filter. Not shown directly here.
  orgId?: string | null
  kind?: 'business' | 'individual'
}

// Surface = neutral identity only. No scores, no severity colors — an entity's
// name is never "stamped" as deficient. The whole row links to the account.
const COLS = 'grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center'

export default function ClientRoster({ rows, mode = 'mixed' }: { rows: RosterRow[]; mode?: 'mixed' | 'individual' }) {
  const t = useT()

  // For an individuals-only view the two right columns describe a person, not a
  // company — so relabel the headers. The cell values are prepared upstream.
  const col2 = mode === 'individual' ? t('admin.residencyCol') : t('admin.type')
  const col3 = mode === 'individual' ? t('admin.taxId') : t('admin.ein')

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className={`${COLS} px-4 py-2 bg-gray-50/70 border-b border-gray-200`}>
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{t('admin.account')}</div>
        <div className="hidden md:block text-[10px] font-medium uppercase tracking-wide text-gray-400">{col2}</div>
        <div className="hidden md:block text-[10px] font-medium uppercase tracking-wide text-gray-400">{col3}</div>
        <div />
      </div>

      {rows.map((c) => {
        const dissolved = c.status && c.status !== 'active'
        return (
          <div key={c.id} className="border-b border-gray-100 last:border-0">
            <Link href={`/admin/clients/${c.slug}`} className={`${COLS} px-4 py-2.5 hover:bg-gray-50 transition-colors`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-900 truncate">{c.name}</span>
                  {c.year && <span className="text-[10px] font-medium text-gray-400 tabular-nums">· {c.year}</span>}
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
              <div className="justify-self-end flex items-center gap-2.5">
                {c.presence && c.presence.length > 0 && <AvatarStack users={c.presence} size={20} max={3} />}
              </div>
            </Link>
          </div>
        )
      })}
    </div>
  )
}

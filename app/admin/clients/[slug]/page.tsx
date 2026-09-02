import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { getClientYears } from '@/lib/yearsServer'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import OpenYearControl from '@/components/OpenYearControl'
import EntityQuickBar from '@/components/EntityQuickBar'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

// The buffer: pick (or open) the tax year before entering the entity's workspace.
export default async function EntityYearPicker({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: clientRow } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!clientRow) notFound()
  const c = clientRow as Client
  const locale = getLocale()
  const viewer = await getViewer()
  const canManage = viewer?.role === 'admin'
  const years = await getClientYears(supabase, c.id)

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
        ← {t(locale, 'team.allAccounts')}
      </Link>

      {/* Entity identity */}
      <h1 className="text-2xl font-bold text-gray-900 mt-4" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
        {c.name}
      </h1>
      {(c.owner_name || c.address) && (
        <p className="text-sm text-gray-600 mt-1">
          {c.owner_name ?? ''}
          {c.owner_name && c.address ? ' · ' : ''}
          {c.address ?? ''}
        </p>
      )}
      <EntityQuickBar c={c} />

      {/* Year chooser */}
      <div className="mt-10 border-t border-gray-100 pt-8">
        <div className="flex items-center justify-between gap-4 mb-5">
          <p className="text-sm text-gray-500">{t(locale, 'year.pickPrompt')}</p>
          {canManage && (
            <OpenYearControl slug={c.slug} nextYear={(years[0]?.year ?? new Date().getFullYear()) + 1} />
          )}
        </div>

        {years.length === 0 ? (
          <p className="text-sm text-gray-400">{t(locale, 'year.noneYet')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {years.map((y) => {
              const closed = y.status === 'closed'
              return (
                <Link
                  key={y.year}
                  href={`/admin/clients/${c.slug}/${y.year}`}
                  className={`rounded-xl border p-4 transition-colors ${
                    closed
                      ? 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      : 'border-gray-200 hover:border-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xl font-semibold text-gray-900 tabular-nums">{y.year}</div>
                  <div className={`text-[11px] uppercase tracking-wide mt-1 ${closed ? 'text-gray-400' : 'text-green-600'}`}>
                    {closed ? t(locale, 'year.closed') : t(locale, 'year.active')}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

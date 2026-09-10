import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PropertyImage from '@/components/PropertyImage'
import { getViewer } from '@/lib/auth'
import { getPortfolio } from '@/lib/propertyServer'
import { PROPERTY_TYPE_LABELS, usd, monthLabel, firstOfMonth, type PropertyType } from '@/lib/property'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Properties — Rovelo Inc',
  robots: { index: false, follow: false },
}

const navAction = 'inline-flex items-center gap-1 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors'

function Plus() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default async function PropertiesHome({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  const canManage = viewer?.role === 'admin' || viewer?.role === 'collaborator'

  const month = firstOfMonth()
  const rows = await getPortfolio(supabase, month)

  // Portfolio-wide totals.
  const total = rows.reduce(
    (a, r) => ({
      units: a.units + r.stats.units,
      occupied: a.occupied + r.stats.occupied,
      monthlyRent: a.monthlyRent + r.stats.monthlyRent,
      collected: a.collected + r.stats.collectedThisMonth,
      due: a.due + r.stats.dueThisMonth,
      outstanding: a.outstanding + r.stats.outstanding,
    }),
    { units: 0, occupied: 0, monthlyRent: 0, collected: 0, due: 0, outstanding: 0 }
  )

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader
        label="Properties"
        email={user?.email}
        settingsHref={null}
        actions={
          canManage ? (
            <Link href="/admin/properties/new" className={navAction}>
              <Plus /> New property
            </Link>
          ) : null
        }
      />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← Dashboard
        </Link>

        {searchParams.ok && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{searchParams.ok}</div>
        )}
        {searchParams.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
        )}

        <div className="mt-4 flex items-end justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
            Properties
          </h1>
          <p className="text-xs text-gray-400">{monthLabel(month)}</p>
        </div>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No properties yet.</p>
            {canManage && (
              <Link href="/admin/properties/new" className={`${navAction} mt-4`}>
                <Plus /> Onboard your first property
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Portfolio summary */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Properties" value={String(rows.length)} />
              <Stat label="Units" value={`${total.occupied}/${total.units} occupied`} />
              <Stat label="Collected this month" value={usd(total.collected)} sub={`of ${usd(total.due)} due`} />
              <Stat label="Outstanding" value={usd(total.outstanding)} tone={total.outstanding > 0 ? 'warn' : 'ok'} />
            </div>

            {/* Property cards */}
            <div className="mt-6 space-y-3">
              {rows.map(({ property, stats }) => (
                <Link
                  key={property.id}
                  href={`/admin/properties/${property.id}`}
                  className="block rounded-xl border border-gray-200 p-4 hover:border-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <PropertyImage
                      lat={property.lat}
                      lng={property.lng}
                      name={property.name}
                      size="240x160"
                      className="hidden sm:block w-28 h-20 rounded-lg object-cover shrink-0 border border-gray-100"
                    />
                    <div className="flex items-start justify-between gap-4 flex-1 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{property.name}</p>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                          {PROPERTY_TYPE_LABELS[property.type as PropertyType] ?? property.type}
                        </span>
                      </div>
                      {property.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{property.address}</p>}
                      <p className="text-xs text-gray-500 mt-1.5">
                        {stats.occupied}/{stats.units} occupied · {usd(stats.monthlyRent)}/mo
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        {usd(stats.collectedThisMonth)}
                        <span className="text-gray-400 font-normal"> / {usd(stats.dueThisMonth)}</span>
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">collected this month</p>
                      {stats.outstanding > 0 && (
                        <p className="text-[11px] text-amber-600 mt-1">{usd(stats.outstanding)} outstanding</p>
                      )}
                    </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-1 ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

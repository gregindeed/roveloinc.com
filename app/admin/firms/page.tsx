import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AuthHeader from '@/components/AuthHeader'
import { requirePlatform } from '@/lib/auth'
import { inviteFirmManager } from './actions'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import type { Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Firms — Rovelo Inc', robots: { index: false, follow: false } }

export default async function FirmsPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  await requirePlatform()
  const locale = getLocale()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const [{ data: orgs }, { data: clients }, { data: mems }, { data: userList }] = await Promise.all([
    admin.from('organizations').select('*').order('is_platform', { ascending: false }).order('name'),
    admin.from('clients').select('id, org_id'),
    admin.from('memberships').select('user_id, org_id, role').eq('role', 'admin'),
    admin.auth.admin.listUsers(),
  ])

  const firms = (orgs ?? []) as Organization[]
  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '(no email)']))
  const clientCount: Record<string, number> = {}
  for (const c of clients ?? []) clientCount[c.org_id as string] = (clientCount[c.org_id as string] ?? 0) + 1
  const managersByOrg: Record<string, string[]> = {}
  for (const m of mems ?? []) {
    const oid = m.org_id as string
    if (!oid) continue
    ;(managersByOrg[oid] ??= []).push(emailById.get(m.user_id as string) ?? '(unknown)')
  }

  const partnerCount = firms.filter((f) => !f.is_platform).length

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref="/admin/team" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← {t(locale, 'team.allAccounts')}
        </Link>

        <div className="flex items-start justify-between gap-3 mt-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t(locale, 'team.firms')}</h1>
            <p className="text-sm text-gray-600 mt-1">{t(locale, 'team.firmsIntro')}</p>
          </div>
          <Link
            href="/admin/firms/new"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t(locale, 'team.newFirm')}
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-3 mb-6">
          {partnerCount === 1
            ? t(locale, 'team.partnerFirmsOne', { n: partnerCount })
            : t(locale, 'team.partnerFirmsOther', { n: partnerCount })}
        </p>

        {searchParams.ok && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}
        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <div className="space-y-4">
          {firms.map((f) => {
            const managers = managersByOrg[f.id] ?? []
            const n = clientCount[f.id] ?? 0
            return (
              <div key={f.id} className="rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {f.name}
                      {f.is_platform && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                          {t(locale, 'team.yourFirm')}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {n === 1 ? t(locale, 'team.accountsOne', { n }) : t(locale, 'team.accountsOther', { n })} ·{' '}
                      {managers.length === 1
                        ? t(locale, 'team.managersOne', { n: managers.length })
                        : t(locale, 'team.managersOther', { n: managers.length })}
                    </p>
                    {f.notes && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{f.notes}</p>}
                  </div>
                  <Link
                    href={`/admin/new/guided?org=${f.id}`}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-full px-2.5 py-1.5 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t(locale, 'team.account')}
                  </Link>
                </div>

                {managers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {managers.map((em, i) => (
                      <span key={i} className="text-[11px] text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                        {em}
                      </span>
                    ))}
                  </div>
                )}

                <details className="mt-3 group border-t border-gray-100 pt-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-800 select-none list-none">
                    + {t(locale, 'team.addManager')}
                  </summary>
                  <form action={inviteFirmManager.bind(null, f.id)} className="mt-2.5 flex flex-wrap items-end gap-2">
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="manager@firm.com"
                      className="flex-1 min-w-[200px] border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
                      {t(locale, 'team.sendInvite')}
                    </button>
                  </form>
                </details>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

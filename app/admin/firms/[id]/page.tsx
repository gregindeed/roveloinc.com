import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AuthHeader from '@/components/AuthHeader'
import { requirePlatform } from '@/lib/auth'
import { inviteFirmManager, resetManagerAccess, setFirmPropertyModule, addFirmCollaboration, removeFirmCollaboration } from '../actions'
import Avatar from '@/components/Avatar'
import { isOnline } from '@/lib/presence'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import type { Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Firm — Rovelo Inc', robots: { index: false, follow: false } }

export default async function FirmProperties({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { ok?: string; error?: string }
}) {
  await requirePlatform()
  const locale = getLocale()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const [{ data: org }, { data: clients }, { data: mems }, { data: userList }] = await Promise.all([
    admin.from('organizations').select('*').eq('id', params.id).single(),
    admin.from('clients').select('id, name, slug, archived_at').eq('org_id', params.id).order('name'),
    admin.from('memberships').select('user_id').eq('org_id', params.id).eq('role', 'admin'),
    admin.auth.admin.listUsers(),
  ])
  if (!org) notFound()
  const firm = org as Organization

  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '(no email)']))
  const managerIds = (mems ?? []).map((m) => m.user_id as string)
  const { data: mgrProfiles } = managerIds.length
    ? await admin.from('profiles').select('id, display_name, last_seen_at').in('id', managerIds)
    : { data: [] as { id: string; display_name: string | null; last_seen_at: string | null }[] }
  const profById = new Map((mgrProfiles ?? []).map((p) => [p.id as string, p]))
  const managers = managerIds.map((id) => {
    const p = profById.get(id)
    return {
      id,
      email: emailById.get(id) ?? '(unknown)',
      name: (p?.display_name as string | null) ?? null,
      online: isOnline((p?.last_seen_at as string | null) ?? null),
    }
  })
  const accounts = (clients ?? []).filter((c) => !c.archived_at)

  // Firm-level collaborations: accounts (owned by other firms) this firm
  // co-manages, plus the pool of accounts it could be assigned to.
  const [{ data: collabRows }, { data: allClients }] = await Promise.all([
    admin.from('firm_collaborators').select('id, client_id').eq('org_id', params.id),
    admin.from('clients').select('id, name, org_id').is('archived_at', null).order('name'),
  ])
  const clientById = new Map((allClients ?? []).map((c) => [c.id as string, c as { id: string; name: string; org_id: string | null }]))
  const orgNameById = new Map((await admin.from('organizations').select('id, name')).data?.map((o) => [o.id as string, o.name as string]) ?? [])
  const collaborations = (collabRows ?? []).map((r) => {
    const c = clientById.get(r.client_id as string)
    return {
      id: r.id as string,
      clientId: r.client_id as string,
      name: c?.name ?? '(removed account)',
      ownerFirm: c?.org_id ? orgNameById.get(c.org_id) ?? '' : '',
    }
  })
  const collabClientIds = new Set(collaborations.map((c) => c.clientId))
  // Assignable = active accounts owned by a different firm, not already collaborated.
  const assignable = (allClients ?? []).filter(
    (c) => c.org_id !== params.id && !collabClientIds.has(c.id as string)
  ) as { id: string; name: string; org_id: string | null }[]

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref="/admin/team" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin/firms" className="text-xs text-gray-500 hover:text-gray-900">
          ← {t(locale, 'team.firms')}
        </Link>

        <div className="flex items-start justify-between gap-3 mt-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">
              {firm.name}
              {firm.is_platform && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600 align-middle">{t(locale, 'team.yourFirm')}</span>
              )}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {accounts.length === 1
                ? t(locale, 'team.accountsOne', { n: accounts.length })
                : t(locale, 'team.accountsOther', { n: accounts.length })}{' '}
              ·{' '}
              {managers.length === 1
                ? t(locale, 'team.managersOne', { n: managers.length })
                : t(locale, 'team.managersOther', { n: managers.length })}
            </p>
            {firm.notes && <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-xl">{firm.notes}</p>}
          </div>
          <Link
            href={`/admin/new/guided?org=${firm.id}`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t(locale, 'team.newAccount')}
          </Link>
        </div>

        {searchParams.ok && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}
        {searchParams.error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        {/* Managers */}
        <div className="mt-8 rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">{t(locale, 'team.accountantManagers')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">{t(locale, 'team.accountantManagersHint')}</p>
          {managers.length > 0 ? (
            <div className="space-y-1.5 mb-3">
              {managers.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={m.name || m.email} email={m.email} online={m.online} size={28} />
                    <div className="min-w-0">
                      <div className="text-[13px] text-gray-700 truncate">{m.name || m.email}</div>
                      {m.name && <div className="text-[11px] text-gray-400 truncate">{m.email}</div>}
                    </div>
                  </div>
                  {m.email.includes('@') && (
                    <form action={resetManagerAccess.bind(null, firm.id)}>
                      <input type="hidden" name="email" value={m.email} />
                      <button className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors whitespace-nowrap">
                        {t(locale, 'team.resendAccess')}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-3">{t(locale, 'team.noManagers')}</p>
          )}
          <form action={inviteFirmManager.bind(null, firm.id)} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <input
              name="email"
              type="email"
              required
              placeholder="manager@firm.com"
              className="flex-1 min-w-[220px] border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">{t(locale, 'team.sendInvite')}</button>
          </form>
        </div>

        {/* Collaborations — accounts owned by other firms that this firm co-manages */}
        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Collaborations</h2>
          <p className="mt-0.5 mb-3 text-xs text-gray-500">
            Accounts owned by another firm that this firm co-manages. They appear on this firm&apos;s roster marked &ldquo;Collaborating,&rdquo; and its managers gain access.
          </p>
          {collaborations.length > 0 ? (
            <div className="mb-3 space-y-1.5">
              {collaborations.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-gray-800">{c.name}</div>
                    {c.ownerFirm && <div className="text-[11px] text-gray-400">owned by {c.ownerFirm}</div>}
                  </div>
                  <form action={removeFirmCollaboration.bind(null, firm.id, c.id)}>
                    <button className="shrink-0 text-[11px] text-gray-400 transition-colors hover:text-red-600">Remove</button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-xs text-gray-400">No collaborations yet.</p>
          )}
          {assignable.length > 0 && (
            <form action={addFirmCollaboration.bind(null, firm.id)} className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
              <select
                name="client_id"
                required
                defaultValue=""
                className="min-w-[220px] flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="" disabled>Choose an account…</option>
                {assignable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.org_id ? ` · ${orgNameById.get(c.org_id) ?? ''}` : ''}
                  </option>
                ))}
              </select>
              <button className="text-sm font-medium text-gray-900 transition-colors hover:text-gray-500">Add collaboration</button>
            </form>
          )}
        </div>

        {/* Modules — access to optional areas, off by default */}
        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Modules</h2>
          <p className="mt-0.5 mb-3 text-xs text-gray-500">Optional areas this firm can use. Off by default.</p>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-gray-800">Property Management</div>
              <div className="text-[11px] text-gray-400">Rentals, tenants, rent tracking, applications, and P&amp;L.</div>
            </div>
            <form action={setFirmPropertyModule.bind(null, firm.id)} className="flex items-center gap-2.5 shrink-0">
              <input type="hidden" name="back" value={`/admin/firms/${firm.id}`} />
              <input type="hidden" name="enabled" value={firm.property_module ? '' : 'on'} />
              <span className={`text-[11px] font-medium ${firm.property_module ? 'text-green-600' : 'text-gray-400'}`}>
                {firm.property_module ? 'On' : 'Off'}
              </span>
              <button
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  firm.property_module
                    ? 'border border-gray-200 text-gray-600 hover:bg-white'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                }`}
              >
                {firm.property_module ? 'Disable' : 'Enable'}
              </button>
            </form>
          </div>
        </div>

        {/* Accounts under this firm */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">{t(locale, 'team.accounts')}</h2>
          {accounts.length === 0 ? (
            <p className="text-xs text-gray-400">{t(locale, 'team.noAccounts')}</p>
          ) : (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
              {accounts.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/clients/${c.slug}`}
                  className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50"
                >
                  <span className="text-gray-900">{c.name}</span>
                  <span className="text-gray-300">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

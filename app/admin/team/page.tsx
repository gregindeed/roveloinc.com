import Link from 'next/link'
import AuthHeader from '@/components/AuthHeader'
import TeamManager from '@/components/TeamManager'
import SettingsShell from '@/components/SettingsShell'
import { requireOwner } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOnline } from '@/lib/presence'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team — Rovelo Inc', robots: { index: false, follow: false } }

export default async function TeamPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const viewer = await requireOwner()
  const locale = getLocale()
  const admin = createAdminClient()

  const [{ data: userList }, { data: profiles }, { data: grants }, { data: clients }] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from('profiles').select('id, role, is_owner, display_name, last_seen_at'),
    admin.from('entity_access').select('user_id, client_id'),
    admin.from('clients').select('id, name').order('name'),
  ])

  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '(no email)']))
  const grantsByUser = new Map<string, string[]>()
  for (const g of grants ?? []) {
    const arr = grantsByUser.get(g.user_id) ?? []
    arr.push(g.client_id)
    grantsByUser.set(g.user_id, arr)
  }

  const members = (profiles ?? [])
    .filter((p) => p.role === 'admin' || p.role === 'collaborator')
    .map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? '(unknown)',
      name: (p.display_name as string | null) ?? null,
      online: isOnline(p.last_seen_at as string | null),
      role: (p.role === 'admin' ? 'admin' : 'collaborator') as 'admin' | 'collaborator',
      isOwner: !!p.is_owner,
      isYou: p.id === viewer.userId,
      roleLabel: p.is_owner
        ? t(locale, 'team.roleOwner')
        : p.role === 'admin'
          ? t(locale, 'team.roleManagerAll')
          : t(locale, 'team.roleCollaborator'),
      grantIds: grantsByUser.get(p.id) ?? [],
    }))
    // owner first, then managers, then collaborators
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.role.localeCompare(b.role))

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={viewer.email} settingsHref="/admin/team" />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← {t(locale, 'team.allAccounts')}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1 mb-6">{t(locale, 'team.settings')}</h1>

        {searchParams.ok && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}
        {searchParams.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {searchParams.error}
          </div>
        )}

        <SettingsShell
          sections={[
            {
              key: 'team',
              label: t(locale, 'team.team'),
              content: (
                <div>
                  <p className="text-sm text-gray-600 mb-4">{t(locale, 'team.teamIntro')}</p>
                  <TeamManager members={members} clients={(clients ?? []) as { id: string; name: string }[]} />
                </div>
              ),
            },
            {
              key: 'general',
              label: t(locale, 'team.general'),
              content: (
                <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">
                  {t(locale, 'team.generalPlaceholder')}
                </div>
              ),
            },
          ]}
        />
      </main>
    </div>
  )
}

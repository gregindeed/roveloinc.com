import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import ClientTabs from '@/components/ClientTabs'
import EntityQuickBar from '@/components/EntityQuickBar'
import GlobalIntake from '@/components/GlobalIntake'
import HideOnSettings from '@/components/HideOnSettings'
import { getViewer } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({
  params,
  children,
}: {
  params: { slug: string }
  children: React.ReactNode
}) {
  const supabase = createClient()
  // One cached auth resolution shared with the page below (and any guard) —
  // no separate getUser() round-trip here. Middleware already gated this route.
  const viewer = await getViewer()

  const { data: c } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.slug)
    .single()
  if (!c) notFound()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={viewer?.email} settingsHref={viewer?.isOwner ? '/admin/team' : null} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <HideOnSettings>
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All accounts
        </Link>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{c.name}</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              {c.owner_name ? `${c.owner_name} · ` : ''}
              {c.address ?? ''}
            </p>
            <EntityQuickBar c={c} />
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <GlobalIntake
              slug={c.slug}
              clientId={c.id}
              currentUserId={viewer!.userId}
              current={{
                legal_name: c.legal_name,
                entity_type: c.entity_type,
                ein: c.ein,
                ca_sos_number: c.ca_sos_number,
                cdtfa_account: c.cdtfa_account,
                edd_account: c.edd_account,
                ftb_id: c.ftb_id,
                formation_date: c.formation_date,
                naics_code: c.naics_code,
                address: c.address,
              }}
            />
            <Link
              href={`/admin/clients/${c.slug}/account`}
              title="Entity settings"
              aria-label="Entity settings"
              className="flex items-center justify-center h-8 w-8 text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>
        <ClientTabs slug={c.slug} incomeModel={c.income_model} />
        </HideOnSettings>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ClientTabs from '@/components/ClientTabs'
import EntityQuickBar from '@/components/EntityQuickBar'
import GlobalIntake from '@/components/GlobalIntake'
import AvatarStack from '@/components/AvatarStack'
import YearControl from '@/components/YearControl'
import OverseerBrief from '@/components/OverseerBrief'
import { getViewer } from '@/lib/auth'
import { entityPresence } from '@/lib/presenceServer'
import { getClientYears } from '@/lib/yearsServer'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { localizedAssessment } from '@/lib/assessmentL10n'
import { FILING_STATUS_LABELS } from '@/lib/types'

export const dynamic = 'force-dynamic'

// The year-scoped workspace chrome: entity header, the year bar, and the tabs.
export default async function YearLayout({
  params,
  children,
}: {
  params: { slug: string; year: string }
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  const year = Number(params.year)

  const { data: c } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!c) notFound()

  const [presence, years, { data: assessment }] = await Promise.all([
    entityPresence(createAdminClient(), [c.id as string], { excludeUserId: user?.id }),
    getClientYears(supabase, c.id as string),
    supabase
      .from('ai_assessments')
      .select('brief, content, created_at, source_lang, translations')
      .eq('client_id', c.id)
      .eq('scope', 'overview')
      .maybeSingle(),
  ])
  const here = presence.get(c.id as string) ?? []
  const canManage = viewer?.role === 'admin'
  const locale = getLocale()
  const isClosed = years.find((y) => y.year === year)?.status === 'closed'

  // The Overseer read, in the viewer's language (translate + cache on first view).
  const overseerRead = assessment
    ? await localizedAssessment(
        {
          client_id: c.id as string,
          scope: 'overview',
          content: assessment.content,
          source_lang: assessment.source_lang ?? null,
          translations: assessment.translations ?? null,
        },
        locale
      )
    : null

  return (
    <>
      <Link href={`/admin/clients/${c.slug}`} className="text-xs text-gray-500 hover:text-gray-900">
        ← {c.name}
      </Link>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{c.name}</h1>
            {here.length > 0 && <AvatarStack users={here} size={24} />}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {c.owner_name ? `${c.owner_name} · ` : ''}
            {c.address ?? ''}
          </p>
          {c.kind === 'individual' ? (
            <p className="text-xs mt-2">
              <span className="text-gray-500">Individual</span>
              {c.filing_status && (
                <span className="text-gray-900 font-medium"> · {FILING_STATUS_LABELS[c.filing_status] ?? c.filing_status}</span>
              )}
            </p>
          ) : (
            <EntityQuickBar c={c} />
          )}
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <YearControl slug={c.slug} years={years} selectedYear={year} canManage={canManage} />
          <span className="h-6 w-px bg-gray-200 mx-0.5" />
          <GlobalIntake
            slug={c.slug}
            year={year}
            clientId={c.id}
            currentUserId={user!.id}
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

      {isClosed && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs text-gray-600">
          {t(locale, 'year.closedBanner')}
        </div>
      )}

      <div className="mt-5">
        <OverseerBrief
          slug={c.slug}
          brief={assessment?.brief ?? null}
          read={overseerRead ?? assessment?.content ?? null}
          context={c.overseer_context}
          createdAt={assessment?.created_at ?? null}
        />
      </div>

      <ClientTabs slug={c.slug} year={year} kind={c.kind} />
      <div className="mt-6">{children}</div>
    </>
  )
}

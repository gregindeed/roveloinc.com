import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import GuidedOnboarding from '@/components/GuidedOnboarding'
import { getLocale } from '@/lib/i18n-server'
import { ob } from '@/lib/onboarding/i18n'
import type { Organization } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New account — Rovelo Inc', robots: { index: false, follow: false } }

export default async function GuidedNew({ searchParams }: { searchParams: { org?: string } }) {
  const viewer = await requireAdmin()
  const locale = getLocale()
  const supabase = createClient()

  let firms: Organization[] = []
  if (viewer.isPlatform) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('is_platform', { ascending: false })
      .order('name')
    firms = (data ?? []) as Organization[]
  } else if (viewer.orgId) {
    const { data } = await supabase.from('organizations').select('*').eq('id', viewer.orgId)
    firms = (data ?? []) as Organization[]
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span
            className="text-lg text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
          <div className="flex items-center gap-5">
            <Link
              href={searchParams.org ? `/admin/new?org=${searchParams.org}` : '/admin/new'}
              className="text-sm text-gray-300 hover:text-gray-600"
            >
              {ob(locale, 'page.classic')}
            </Link>
            <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-900">
              {ob(locale, 'page.cancel')}
            </Link>
          </div>
        </div>
      </div>
      <GuidedOnboarding
        firms={firms.map((f) => ({ id: f.id, name: f.name, is_platform: f.is_platform }))}
        defaultOrg={searchParams.org}
        isPlatform={!!viewer.isPlatform}
      />
    </div>
  )
}

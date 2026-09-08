import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { requireAdmin } from '@/lib/auth'
import type { Organization } from '@/lib/types'
import NewAccountForm from '@/components/NewAccountForm'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'New account — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function NewClient({
  searchParams,
}: {
  searchParams: { error?: string; org?: string }
}) {
  const viewer = await requireAdmin() // managers/owner only — not collaborators
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Platform super-admins choose which firm the client belongs to.
  let firms: Organization[] = []
  if (viewer.isPlatform) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .order('is_platform', { ascending: false })
      .order('name')
    firms = (data ?? []) as Organization[]
  }

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref={viewer.isOwner ? '/admin/team' : null} />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All accounts
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">Onboard a new account</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          A business or an individual — sets up the record and, for a business, seeds its books. A portal login is
          optional; add it now or later.
        </p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <NewAccountForm firms={firms} isPlatform={!!viewer.isPlatform} defaultOrg={searchParams.org} />
      </main>
    </div>
  )
}

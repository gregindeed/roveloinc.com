import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import ClientTabs from '@/components/ClientTabs'
import EntityQuickBar from '@/components/EntityQuickBar'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({
  params,
  children,
}: {
  params: { slug: string }
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: c } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.slug)
    .single()
  if (!c) notFound()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All clients
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
            <Link
              href={`/admin/clients/${c.slug}/account`}
              className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
            >
              Account details
            </Link>
            <Link
              href={`/admin/clients/${c.slug}/edit`}
              className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
            >
              Edit profile
            </Link>
          </div>
        </div>
        <ClientTabs slug={c.slug} />
        <div className="mt-6">{children}</div>
      </main>
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntityProfile from '@/components/EntityProfile'
import type { Client, Officer } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function AccountPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!data) notFound()
  const c = data as Client

  const { data: officers } = await supabase
    .from('entity_officers')
    .select('*')
    .eq('client_id', c.id)
    .order('created_at')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Account details</h1>
        <Link
          href={`/admin/clients/${c.slug}/edit`}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
        >
          Edit profile
        </Link>
      </div>
      <EntityProfile c={c} officers={(officers ?? []) as Officer[]} />
    </div>
  )
}

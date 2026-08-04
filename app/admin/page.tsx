import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import type { Client } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Admin — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function AdminHome() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: clients } = await supabase.from('clients').select('*').order('name')

  const list = (clients ?? []) as Client[]

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <Link
            href="/admin/new"
            className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800 transition-colors"
          >
            + New client
          </Link>
        </div>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          {list.length} {list.length === 1 ? 'client' : 'clients'}. Select one to view their books.
        </p>

        {list.length === 0 ? (
          <p className="text-sm text-gray-500">No clients yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((c) => (
              <Link
                key={c.id}
                href={`/admin/clients/${c.slug}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-gray-400 transition-colors"
              >
                <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {c.owner_name ?? c.legal_name ?? c.slug}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

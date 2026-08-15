import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PortalTabs from '@/components/PortalTabs'

export const dynamic = 'force-dynamic'

// The client portal is authenticated and must never be indexed. This overrides
// the root layout's robots.index=true for every route under /portal.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user!.id)
    .single()

  if (!profile?.client_id) {
    return (
      <div className="min-h-screen bg-white">
        <AuthHeader label="Client Portal" email={user?.email} />
        <main className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-sm text-gray-600">
            Your account isn&apos;t linked to a client yet. Please contact Rovelo Inc.
          </p>
        </main>
      </div>
    )
  }

  const { data: c } = await supabase
    .from('clients')
    .select('name, owner_name, address')
    .eq('id', profile.client_id)
    .single()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Client Portal" email={user?.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{c?.name ?? 'Your business'}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {c?.owner_name ? `${c.owner_name} · ` : ''}
            {c?.address ?? ''}
          </p>
        </div>
        <PortalTabs />
        <div className="mt-6">{children}</div>
      </main>
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import BooksView from '@/components/BooksView'
import DocumentsPanel from '@/components/DocumentsPanel'
import CompliancePanel from '@/components/CompliancePanel'
import type {
  Client,
  Deposit,
  CheckingExpense,
  CCTransaction,
  DocumentRow,
  Obligation,
  ObligationEvent,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Your books — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function Portal() {
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
        <AuthHeader label="Client" email={user?.email} />
        <main className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-sm text-gray-600">
            Your account isn&apos;t linked to a client yet. Please contact Rovelo Inc.
          </p>
        </main>
      </div>
    )
  }

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', profile.client_id)
    .single()

  // RLS guarantees these only return the signed-in client's own rows.
  const [
    { data: deposits },
    { data: checking },
    { data: cc },
    { data: documents },
    { data: obligations },
    { data: events },
  ] = await Promise.all([
    supabase.from('deposits').select('*').order('txn_date'),
    supabase.from('checking_expenses').select('*').order('txn_date'),
    supabase.from('cc_transactions').select('*').order('post_date'),
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
    supabase.from('obligations').select('*').order('created_at'),
    supabase.from('obligation_events').select('*').order('due_date'),
  ])

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Client" email={user?.email} />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{(client as Client).name}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {(client as Client).owner_name ? `${(client as Client).owner_name} · ` : ''}
            {(client as Client).address ?? ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">Period: April 2026</p>
        </div>
        <CompliancePanel
          slug={(client as Client).slug}
          obligations={(obligations ?? []) as Obligation[]}
          events={(events ?? []) as ObligationEvent[]}
          isAdmin={false}
          currentYear={new Date().getFullYear()}
        />
        <DocumentsPanel
          clientId={profile.client_id}
          currentUserId={user!.id}
          isAdmin={false}
          initialDocs={(documents ?? []) as DocumentRow[]}
        />
        <BooksView
          client={client as Client}
          deposits={(deposits ?? []) as Deposit[]}
          checking={(checking ?? []) as CheckingExpense[]}
          cc={(cc ?? []) as CCTransaction[]}
          showHeader={false}
        />
      </main>
    </div>
  )
}

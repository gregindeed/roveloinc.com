import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import BooksView from '@/components/BooksView'
import DocumentsPanel from '@/components/DocumentsPanel'
import EntityHeader from '@/components/EntityHeader'
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
export const metadata = { robots: { index: false, follow: false } }

export default async function ClientBooks({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { ok?: string; warn?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!client) notFound()
  const c = client as Client

  const [
    { data: deposits },
    { data: checking },
    { data: cc },
    { data: documents },
    { data: obligations },
    { data: events },
  ] = await Promise.all([
    supabase.from('deposits').select('*').eq('client_id', c.id).order('txn_date'),
    supabase.from('checking_expenses').select('*').eq('client_id', c.id).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', c.id).order('post_date'),
    supabase.from('documents').select('*').eq('client_id', c.id).order('created_at', { ascending: false }),
    supabase.from('obligations').select('*').eq('client_id', c.id).order('created_at'),
    supabase.from('obligation_events').select('*').eq('client_id', c.id).order('due_date'),
  ])

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← All clients
        </Link>
        {searchParams.ok && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}
        {searchParams.warn && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            {searchParams.warn}
          </div>
        )}
        <div className="mt-4 space-y-8">
          <EntityHeader c={c} />
          <CompliancePanel
            slug={c.slug}
            obligations={(obligations ?? []) as Obligation[]}
            events={(events ?? []) as ObligationEvent[]}
            isAdmin={true}
            currentYear={new Date().getFullYear()}
          />
          <DocumentsPanel
            clientId={c.id}
            currentUserId={user!.id}
            isAdmin={true}
            initialDocs={(documents ?? []) as DocumentRow[]}
          />
          <BooksView
            client={c}
            deposits={(deposits ?? []) as Deposit[]}
            checking={(checking ?? []) as CheckingExpense[]}
            cc={(cc ?? []) as CCTransaction[]}
            showHeader={false}
          />
        </div>
      </main>
    </div>
  )
}

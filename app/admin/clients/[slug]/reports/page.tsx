import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsPanel from '@/components/ReportsPanel'
import type {
  Client,
  Account,
  Deposit,
  CheckingExpense,
  CCTransaction,
  SalesEntry,
  StatementImportRow,
  Officer,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function AdminReportsPage({ params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!client) notFound()
  const cid = client.id as string

  const [
    { data: deposits },
    { data: checking },
    { data: cc },
    { data: accounts },
    { data: sales },
    { data: statements },
    { data: officers },
  ] = await Promise.all([
    supabase.from('deposits').select('*').eq('client_id', cid).order('txn_date'),
    supabase.from('checking_expenses').select('*').eq('client_id', cid).order('txn_date'),
    supabase.from('cc_transactions').select('*').eq('client_id', cid).order('post_date'),
    supabase.from('chart_of_accounts').select('*').eq('client_id', cid).order('code'),
    supabase.from('sales_entries').select('*').eq('client_id', cid).eq('status', 'posted').order('entry_date'),
    supabase.from('statement_imports').select('*').eq('client_id', cid),
    supabase.from('entity_officers').select('*').eq('client_id', cid),
  ])

  return (
    <ReportsPanel
      client={client as Client}
      accounts={(accounts ?? []) as Account[]}
      deposits={(deposits ?? []) as Deposit[]}
      checking={(checking ?? []) as CheckingExpense[]}
      cc={(cc ?? []) as CCTransaction[]}
      salesEntries={(sales ?? []) as SalesEntry[]}
      statements={(statements ?? []) as StatementImportRow[]}
      officers={(officers ?? []) as Officer[]}
    />
  )
}

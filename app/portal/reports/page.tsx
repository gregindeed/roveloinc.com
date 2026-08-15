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
export const metadata = { title: 'Reports — Rovelo Inc', robots: { index: false, follow: false } }

export default async function PortalReports() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', user!.id).single()
  if (!profile?.client_id) return null

  const { data: client } = await supabase.from('clients').select('*').eq('id', profile.client_id).single()

  const [
    { data: deposits },
    { data: checking },
    { data: cc },
    { data: accounts },
    { data: sales },
    { data: statements },
    { data: officers },
  ] = await Promise.all([
    supabase.from('deposits').select('*').order('txn_date'),
    supabase.from('checking_expenses').select('*').order('txn_date'),
    supabase.from('cc_transactions').select('*').order('post_date'),
    supabase.from('chart_of_accounts').select('*').order('code'),
    supabase.from('sales_entries').select('*').eq('status', 'posted').order('entry_date'),
    supabase.from('statement_imports').select('*'),
    supabase.from('entity_officers').select('*'),
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

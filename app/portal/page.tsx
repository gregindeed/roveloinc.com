import { createClient } from '@/lib/supabase/server'
import PortalFinancials from '@/components/PortalFinancials'
import EntityFacts from '@/components/EntityFacts'
import { getChartOfAccounts } from '@/lib/coaServer'
import type { Client, Deposit, CheckingExpense, CCTransaction, SalesEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Your books — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default async function PortalOverview() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user!.id)
    .single()
  if (!profile?.client_id) return null

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', profile.client_id)
    .single()

  // RLS returns only the signed-in client's own rows.
  const [{ data: deposits }, { data: checking }, { data: cc }, accounts, { data: sales }] = await Promise.all([
    supabase.from('deposits').select('*').order('txn_date'),
    supabase.from('checking_expenses').select('*').order('txn_date'),
    supabase.from('cc_transactions').select('*').order('post_date'),
    // Chart of accounts — cached (tag-invalidated on edits). clientId comes from
    // the viewer's own profile, so this is scoped to their entity.
    getChartOfAccounts(profile.client_id),
    supabase.from('sales_entries').select('*').eq('status', 'posted').order('entry_date'),
  ])

  return (
    <div className="space-y-8">
      <EntityFacts c={client as Client} />
      <PortalFinancials
        deposits={(deposits ?? []) as Deposit[]}
        checking={(checking ?? []) as CheckingExpense[]}
        cc={(cc ?? []) as CCTransaction[]}
        accounts={accounts}
        salesEntries={(sales ?? []) as SalesEntry[]}
      />
    </div>
  )
}

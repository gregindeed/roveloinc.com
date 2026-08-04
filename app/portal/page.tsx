import { createClient } from '@/lib/supabase/server'
import BooksView from '@/components/BooksView'
import EntityFacts from '@/components/EntityFacts'
import type { Client, Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

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
  const [{ data: deposits }, { data: checking }, { data: cc }] = await Promise.all([
    supabase.from('deposits').select('*').order('txn_date'),
    supabase.from('checking_expenses').select('*').order('txn_date'),
    supabase.from('cc_transactions').select('*').order('post_date'),
  ])

  return (
    <div className="space-y-8">
      <EntityFacts c={client as Client} />
      <BooksView
        client={client as Client}
        deposits={(deposits ?? []) as Deposit[]}
        checking={(checking ?? []) as CheckingExpense[]}
        cc={(cc ?? []) as CCTransaction[]}
        showHeader={false}
      />
    </div>
  )
}

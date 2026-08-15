import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PeriodBar from '@/components/PeriodBar'
import SalesJournal from '@/components/SalesJournal'
import SalesImport from '@/components/SalesImport'
import { parsePeriod, inPeriod } from '@/lib/period'
import type { SalesEntry, Account } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { year?: string; q?: string; month?: string; day?: string }
}) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug').eq('slug', params.slug).single()
  if (!client) notFound()

  const now = new Date().getFullYear()
  const period = parsePeriod(searchParams, now)

  const [{ data: entries }, { data: accounts }] = await Promise.all([
    supabase.from('sales_entries').select('*').eq('client_id', client.id).eq('status', 'posted').order('entry_date'),
    supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('client_id', client.id)
      .eq('type', 'income')
      .eq('active', true)
      .order('code'),
  ])

  const rows = ((entries ?? []) as SalesEntry[]).filter((e) => inPeriod(e.entry_date, period))
  const income = (accounts ?? []) as Account[]
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <PeriodBar years={[now, now - 1, now - 2, now - 3]} />
      <p className="text-xs text-gray-500">
        Showing {period.label}. New rows use whatever date you enter. Sales you record here feed the client&apos;s Income
        overview and reconcile against bank deposits.
      </p>
      <SalesImport slug={client.slug} incomeAccounts={income} />
      <SalesJournal
        entries={rows}
        incomeAccounts={income}
        slug={client.slug}
        periodLabel={period.label}
        today={today}
        range={{ from: period.from, to: period.to }}
      />
    </div>
  )
}

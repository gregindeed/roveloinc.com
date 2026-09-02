import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import StatementImport from '@/components/StatementImport'
import BankFeed, { type BankConnection } from '@/components/BankFeed'
import { undoImport } from '@/app/admin/clients/[slug]/statement-actions'
import type { StatementImportRow } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

const money = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }))

export default async function StatementsPage({ params }: { params: { slug: string; year: string } }) {
  const supabase = createClient()
  const { data: client } = await supabase.from('clients').select('id, slug, name').eq('slug', params.slug).single()
  if (!client) notFound()

  const { data: history } = await supabase
    .from('statement_imports')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows = (history ?? []) as StatementImportRow[]

  // Bank connections — read server-side with the service role and expose ONLY
  // safe columns (never the access token) to the UI.
  const admin = createAdminClient()
  const { data: conns } = await admin
    .from('plaid_items')
    .select('id, institution_name, last_synced_at, status')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
  const connections = (conns ?? []) as BankConnection[]
  const plaidConfigured = !!process.env.PLAID_CLIENT_ID

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${client.slug}/${params.year}`} className="text-xs text-gray-500 hover:text-gray-900">
          ← {client.name}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Import a statement</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Drop a bank or credit-card statement. The Overseer reads the line items and balances, files each transaction to
          the right account, and reconciles the total against the statement.
        </p>
      </div>

      <BankFeed slug={client.slug} connections={connections} configured={plaidConfigured} />

      <StatementImport slug={client.slug} clientId={client.id as string} />

      {rows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Import history</h2>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Imported', 'File', 'Type', 'Period', 'In', 'Out', 'Rows', 'Reconciled', ''].map((h, i) => (
                    <th
                      key={h || i}
                      className={`px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium ${
                        i >= 4 && i <= 6 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate">{r.filename ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.statement_type ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {r.period_start ?? '—'} → {r.period_end ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{money(r.total_in)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{money(r.total_out)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.inserted_count ?? 0}</td>
                    <td className="px-3 py-2">
                      {r.opening_balance == null && r.closing_balance == null ? (
                        <span className="text-gray-400">n/a</span>
                      ) : r.reconciled ? (
                        <span className="text-green-700 font-medium">✓ Balanced</span>
                      ) : (
                        <span className="text-amber-700 font-medium">⚠ Off {money(Math.abs(r.difference ?? 0))}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={undoImport.bind(null, client.slug, r.id)}>
                        <button className="text-xs font-medium text-red-600 hover:text-red-700">Undo</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

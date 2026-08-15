import type { Client, Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'
import { computePnl } from '@/lib/pnl'
import PnlStatement from '@/components/PnlStatement'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

export default function BooksView({
  client,
  deposits,
  checking,
  cc,
  accounts,
  periodLabel = 'All activity',
  showHeader = true,
}: {
  client: Client
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  accounts: Account[]
  periodLabel?: string
  showHeader?: boolean
}) {
  const pnl = computePnl(deposits, checking, cc, accounts)
  const acctName = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]))
  const label = (r: { account_id: string | null; category: string | null }) =>
    (r.account_id && acctName.get(r.account_id)) || r.category || '—'

  return (
    <div className="space-y-8">
      {showHeader && (
        <div>
          <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {client.owner_name ? `${client.owner_name} · ` : ''}
            {client.address ?? ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">{periodLabel}</p>
        </div>
      )}

      {/* Income statement, by account */}
      <PnlStatement pnl={pnl} periodLabel={periodLabel} />

      {/* Transaction detail */}
      <Section title={`Deposits (${deposits.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Date', 'Description', 'Account', 'Amount']} />
          </thead>
          <tbody>
            {deposits.map((r) => (
              <Tr key={r.id} cells={[fmtDate(r.txn_date), r.description, label(r), money(Number(r.amount))]} last />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Checking expenses (${checking.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Date', 'Check #', 'Description', 'Account', 'Amount']} />
          </thead>
          <tbody>
            {checking.map((r) => (
              <Tr
                key={r.id}
                cells={[fmtDate(r.txn_date), r.check_num ?? '', r.description, label(r), money(Number(r.amount))]}
                last
              />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Credit-card activity (${cc.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Post', 'Card', 'Description', 'Account', 'Personal', 'Amount']} />
          </thead>
          <tbody>
            {cc.map((r) => (
              <Tr
                key={r.id}
                cells={[
                  fmtDate(r.post_date),
                  r.account ?? '',
                  r.description,
                  label(r),
                  r.personal ? 'Yes' : '—',
                  money(Number(r.amount)),
                ]}
                last
                highlight={r.personal}
              />
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">{children}</div>
    </div>
  )
}

function Tr({
  cells,
  head,
  last,
  highlight,
}: {
  cells: string[]
  head?: boolean
  last?: boolean
  highlight?: boolean
}) {
  if (head) {
    return (
      <tr className="bg-gray-50">
        {cells.map((c, i) => (
          <th
            key={i}
            className={`text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium ${
              i === cells.length - 1 ? 'text-right' : ''
            }`}
          >
            {c}
          </th>
        ))}
      </tr>
    )
  }
  return (
    <tr className={`${!last ? 'border-b border-gray-100' : ''} ${highlight ? 'bg-amber-50' : ''}`}>
      {cells.map((c, i) => (
        <td
          key={i}
          className={`px-3 py-2 text-gray-700 ${i === cells.length - 1 ? 'text-right tabular-nums text-gray-900' : ''}`}
        >
          {c}
        </td>
      ))}
    </tr>
  )
}

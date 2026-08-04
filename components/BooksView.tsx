import type { Client, Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const fmtDate = (iso: string) => {
  // iso is 'YYYY-MM-DD'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function sumByCategory<T extends { category: string | null; amount: number }>(rows: T[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = r.category || 'Uncategorized'
    map.set(key, (map.get(key) || 0) + Number(r.amount))
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

export default function BooksView({
  client,
  deposits,
  checking,
  cc,
  showHeader = true,
}: {
  client: Client
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  showHeader?: boolean
}) {
  const income = deposits.reduce((a, r) => a + Number(r.amount), 0)
  const expenses = checking.reduce((a, r) => a + Number(r.amount), 0)
  const net = income - expenses
  const personalCharges = cc.filter((r) => r.personal).reduce((a, r) => a + Number(r.amount), 0)

  const incomeByCat = sumByCategory(deposits)
  const expenseByCat = sumByCategory(checking)

  return (
    <div className="space-y-8">
      {/* Client header */}
      {showHeader && (
        <div>
          <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {client.owner_name ? `${client.owner_name} · ` : ''}
            {client.address ?? ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">Period: April 2026</p>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total Deposits" value={money(income)} tone="pos" />
        <Tile label="Checking Expenses" value={money(expenses)} tone="neg" />
        <Tile label="Net (Deposits − Exp.)" value={money(net)} tone={net >= 0 ? 'pos' : 'neg'} />
        <Tile label="Personal Charges" value={money(personalCharges)} tone="warn" />
      </div>

      {personalCharges > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{money(personalCharges)}</strong> in personal charges were identified on the
          business card and are flagged below for owner reimbursement or reclassification.
        </div>
      )}

      {/* Category breakdowns */}
      <div className="grid md:grid-cols-2 gap-8">
        <CategoryTable title="Income by category" rows={incomeByCat} total={income} />
        <CategoryTable title="Expenses by category" rows={expenseByCat} total={expenses} />
      </div>

      {/* Transaction detail */}
      <Section title={`Deposits (${deposits.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Date', 'Description', 'Category', 'Amount']} />
          </thead>
          <tbody>
            {deposits.map((r) => (
              <Tr key={r.id} cells={[fmtDate(r.txn_date), r.description, r.category ?? '', money(Number(r.amount))]} last />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Checking expenses (${checking.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Date', 'Check #', 'Description', 'Category', 'Amount']} />
          </thead>
          <tbody>
            {checking.map((r) => (
              <Tr
                key={r.id}
                cells={[fmtDate(r.txn_date), r.check_num ?? '', r.description, r.category ?? '', money(Number(r.amount))]}
                last
              />
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Credit-card activity (${cc.length})`}>
        <table className="w-full text-sm">
          <thead>
            <Tr head cells={['Post', 'Account', 'Description', 'Category', 'Personal', 'Amount']} />
          </thead>
          <tbody>
            {cc.map((r) => (
              <Tr
                key={r.id}
                cells={[
                  fmtDate(r.post_date),
                  r.account ?? '',
                  r.description,
                  r.category ?? '',
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

function Tile({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'warn' }) {
  const color =
    tone === 'pos' ? 'text-green-700' : tone === 'neg' ? 'text-gray-900' : 'text-amber-700'
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function CategoryTable({
  title,
  rows,
  total,
}: {
  title: string
  rows: [string, number][]
  total: number
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{title}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([cat, amt]) => (
            <tr key={cat} className="border-b border-gray-100">
              <td className="py-1.5 text-gray-700">{cat}</td>
              <td className="py-1.5 text-right text-gray-900 tabular-nums">{money(amt)}</td>
            </tr>
          ))}
          <tr className="border-t border-gray-300 font-semibold">
            <td className="py-1.5 text-gray-900">Total</td>
            <td className="py-1.5 text-right text-gray-900 tabular-nums">{money(total)}</td>
          </tr>
        </tbody>
      </table>
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
          className={`px-3 py-2 text-gray-700 ${
            i === cells.length - 1 ? 'text-right tabular-nums text-gray-900' : ''
          }`}
        >
          {c}
        </td>
      ))}
    </tr>
  )
}

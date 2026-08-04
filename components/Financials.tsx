import type { Deposit, CheckingExpense, CCTransaction } from '@/lib/types'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const fmtDate = (iso: string) => {
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

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
      {label}
    </div>
  )
}

/* ---------------- Overview summary ---------------- */

export function FinancialSummary({
  deposits,
  checking,
  cc,
  periodLabel,
}: {
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  periodLabel: string
}) {
  const income = deposits.reduce((a, r) => a + Number(r.amount), 0)
  const expenses = checking.reduce((a, r) => a + Number(r.amount), 0)
  const net = income - expenses
  const personal = cc.filter((r) => r.personal).reduce((a, r) => a + Number(r.amount), 0)
  const incomeByCat = sumByCategory(deposits)
  const expenseByCat = sumByCategory(checking)

  if (deposits.length === 0 && checking.length === 0 && cc.length === 0) {
    return <Empty label={`No financial activity in ${periodLabel}.`} />
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Total Deposits" value={money(income)} tone="pos" />
        <Tile label="Expenses" value={money(expenses)} tone="neg" />
        <Tile label="Net (Dep − Exp)" value={money(net)} tone={net >= 0 ? 'pos' : 'neg'} />
        <Tile label="Personal Charges" value={money(personal)} tone="warn" />
      </div>

      {personal > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{money(personal)}</strong> in personal charges are flagged in this period for
          owner reimbursement or reclassification.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <CategoryTable title="Income by category" rows={incomeByCat} total={income} />
        <CategoryTable title="Expenses by category" rows={expenseByCat} total={expenses} />
      </div>
    </div>
  )
}

/* ---------------- Transactions (deposits) ---------------- */

export function DepositsTable({ deposits, periodLabel }: { deposits: Deposit[]; periodLabel: string }) {
  if (deposits.length === 0) return <Empty label={`No deposits in ${periodLabel}.`} />
  const total = deposits.reduce((a, r) => a + Number(r.amount), 0)
  return (
    <Section title={`Deposits (${deposits.length}) · ${money(total)}`}>
      <table className="w-full text-sm">
        <thead>
          <HeadRow cells={['Date', 'Description', 'Category', 'Amount']} />
        </thead>
        <tbody>
          {deposits.map((r) => (
            <BodyRow key={r.id} cells={[fmtDate(r.txn_date), r.description, r.category ?? '', money(Number(r.amount))]} />
          ))}
        </tbody>
      </table>
    </Section>
  )
}

/* ---------------- Expenses (checking + card) ---------------- */

export function ExpensesTables({
  checking,
  cc,
  periodLabel,
}: {
  checking: CheckingExpense[]
  cc: CCTransaction[]
  periodLabel: string
}) {
  if (checking.length === 0 && cc.length === 0) return <Empty label={`No expenses in ${periodLabel}.`} />
  const chkTotal = checking.reduce((a, r) => a + Number(r.amount), 0)
  const ccTotal = cc.reduce((a, r) => a + Number(r.amount), 0)
  return (
    <div className="space-y-8">
      {checking.length > 0 && (
        <Section title={`Checking expenses (${checking.length}) · ${money(chkTotal)}`}>
          <table className="w-full text-sm">
            <thead>
              <HeadRow cells={['Date', 'Check #', 'Description', 'Category', 'Amount']} />
            </thead>
            <tbody>
              {checking.map((r) => (
                <BodyRow
                  key={r.id}
                  cells={[fmtDate(r.txn_date), r.check_num ?? '', r.description, r.category ?? '', money(Number(r.amount))]}
                />
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {cc.length > 0 && (
        <Section title={`Credit-card activity (${cc.length}) · ${money(ccTotal)}`}>
          <table className="w-full text-sm">
            <thead>
              <HeadRow cells={['Post', 'Account', 'Description', 'Category', 'Personal', 'Amount']} />
            </thead>
            <tbody>
              {cc.map((r) => (
                <BodyRow
                  key={r.id}
                  highlight={r.personal}
                  cells={[
                    fmtDate(r.post_date),
                    r.account ?? '',
                    r.description,
                    r.category ?? '',
                    r.personal ? 'Yes' : '—',
                    money(Number(r.amount)),
                  ]}
                />
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  )
}

/* ---------------- shared bits ---------------- */

function Tile({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'warn' }) {
  const color = tone === 'pos' ? 'text-green-700' : tone === 'neg' ? 'text-gray-900' : 'text-amber-700'
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function CategoryTable({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
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

function HeadRow({ cells }: { cells: string[] }) {
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

function BodyRow({ cells, highlight }: { cells: string[]; highlight?: boolean }) {
  return (
    <tr className={`border-t border-gray-100 ${highlight ? 'bg-amber-50' : ''}`}>
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

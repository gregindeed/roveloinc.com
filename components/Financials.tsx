import type { Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'
import { computePnl } from '@/lib/pnl'
import PnlStatement from '@/components/PnlStatement'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
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
  accounts,
  periodLabel,
  slug,
}: {
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  accounts: Account[]
  periodLabel: string
  slug: string
}) {
  const pnl = computePnl(deposits, checking, cc, accounts)
  return <PnlStatement pnl={pnl} periodLabel={periodLabel} categorizeHref={`/admin/clients/${slug}/expenses`} />
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

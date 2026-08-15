import type { Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'

// A generic account × period pivot ("overview grid"). Accounts run down the left
// as rows; the top axis is days or MONTHS (toggle). When a `range` is provided
// (the selected filter period), the columns span the WHOLE range — so "Full
// year" shows Jan–Dec (even empty months), a quarter shows its 3 months, a month
// shows its days. Columns come from the entity's own chart of accounts.
//
// Classification mirrors the P&L (lib/pnl.ts) so grid and statement agree.

type Range = { from: string; to: string }

// No currency symbol in the dense grid — right-aligned figures read clearly and
// it saves width. (Amounts are USD, per the account context.)
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}
const monthKey = (iso: string) => iso.slice(0, 7)
// Just the month abbreviation — the year is shown in the period filter, so the
// columns stay narrow enough for a full year to fit without horizontal scroll.
const monthLabel = (ym: string) => {
  const m = ym.split('-')[1]
  return MONTHS[parseInt(m, 10) - 1] ?? m
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let y = +from.slice(0, 4)
  let m = +from.slice(5, 7)
  const ey = +to.slice(0, 4)
  const em = +to.slice(5, 7)
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(`${y}-${pad2(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}
function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  const end = new Date(`${to}T00:00:00`)
  const d = new Date(`${from}T00:00:00`)
  let guard = 0
  while (d <= end && guard++ < 1000) {
    out.push(isoOf(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

const UNCAT = '__uncat__'
type Col = { key: string; label: string }
type Entry = { date: string; key: string; amount: number }

/* ---------------- Income ---------------- */

export function IncomeGrid({ deposits, accounts, range }: { deposits: Deposit[]; accounts: Account[]; range?: Range }) {
  const income = accounts.filter((a) => a.type === 'income').sort((a, b) => a.code.localeCompare(b.code))
  const incomeIds = new Set(income.map((a) => a.id))
  const entries: Entry[] = []
  const used = new Set<string>()
  let hasUncat = false
  for (const d of deposits) {
    if (d.account_id && incomeIds.has(d.account_id)) {
      used.add(d.account_id)
      entries.push({ date: d.txn_date, key: d.account_id, amount: Number(d.amount) })
    } else if (!d.account_id) {
      hasUncat = true
      entries.push({ date: d.txn_date, key: UNCAT, amount: Number(d.amount) })
    }
  }
  // Always show active accounts (so the chart stays visible on empty periods),
  // plus any inactive account that still has activity (never drop data).
  const cols: Col[] = income.filter((a) => a.active || used.has(a.id)).map((a) => ({ key: a.id, label: `${a.code} · ${a.name}` }))
  if (hasUncat) cols.push({ key: UNCAT, label: 'Uncategorized' })
  return <Grid title="Income by period" cols={cols} entries={entries} range={range} emptyLabel="No income accounts set up yet." />
}

/* ---------------- Expenses ---------------- */

export function ExpenseGrid({
  checking,
  cc,
  accounts,
  range,
}: {
  checking: CheckingExpense[]
  cc: CCTransaction[]
  accounts: Account[]
  range?: Range
}) {
  const exp = accounts.filter((a) => a.type === 'expense' || a.type === 'cogs').sort((a, b) => a.code.localeCompare(b.code))
  const expIds = new Set(exp.map((a) => a.id))
  const entries: Entry[] = []
  const used = new Set<string>()
  let hasUncat = false
  for (const r of checking) {
    if (r.account_id && expIds.has(r.account_id)) {
      used.add(r.account_id)
      entries.push({ date: r.txn_date, key: r.account_id, amount: Number(r.amount) })
    } else if (!r.account_id) {
      hasUncat = true
      entries.push({ date: r.txn_date, key: UNCAT, amount: Number(r.amount) })
    }
  }
  for (const r of cc) {
    if (r.account_id && expIds.has(r.account_id)) {
      used.add(r.account_id)
      entries.push({ date: r.post_date, key: r.account_id, amount: Number(r.amount) })
    }
  }
  const cols: Col[] = exp.filter((a) => a.active || used.has(a.id)).map((a) => ({ key: a.id, label: `${a.code} · ${a.name}` }))
  if (hasUncat) cols.push({ key: UNCAT, label: 'Uncategorized' })
  return <Grid title="Expenses by period" cols={cols} entries={entries} range={range} emptyLabel="No expense accounts set up yet." />
}

/* ---------------- shared renderer ---------------- */

function Grid({
  title,
  cols,
  entries,
  emptyLabel,
  range,
}: {
  title: string
  cols: Col[]
  entries: Entry[]
  emptyLabel: string
  range?: Range
}) {
  const rangeMonths = range ? monthsBetween(range.from, range.to) : null
  const monthsPresent = new Set(entries.map((e) => monthKey(e.date)))
  const multiMonth = rangeMonths ? rangeMonths.length > 1 : monthsPresent.size > 1
  // Group by month across a multi-month range; fall back to days for a single month.
  const gran: 'day' | 'month' = multiMonth ? 'month' : 'day'

  if (cols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
        {emptyLabel}
      </div>
    )
  }

  const bucketOf = (d: string) => (gran === 'month' ? monthKey(d) : d)
  // Columns span the whole selected range when we have one; otherwise fall back
  // to just the buckets that have data.
  const buckets = range
    ? gran === 'month'
      ? rangeMonths!
      : daysBetween(range.from, range.to)
    : [...new Set(entries.map((e) => bucketOf(e.date)))].sort()
  const labelOf = (b: string) => (gran === 'month' ? monthLabel(b) : fmtDay(b))

  const matrix = new Map<string, Record<string, number>>()
  for (const b of buckets) matrix.set(b, Object.fromEntries(cols.map((c) => [c.key, 0])))
  const colTotals: Record<string, number> = Object.fromEntries(cols.map((c) => [c.key, 0]))
  let grand = 0
  for (const e of entries) {
    const row = matrix.get(bucketOf(e.date))
    if (!row || !(e.key in row)) continue
    row[e.key] += e.amount
    colTotals[e.key] += e.amount
    grand += e.amount
  }
  const cellVal = (b: string, k: string) => matrix.get(b)?.[k] ?? 0
  const bucketTotal = (b: string) => cols.reduce((a, c) => a + cellVal(b, c.key), 0)
  const cell = (n: number) => (n === 0 ? <span className="text-gray-300">–</span> : money(n))

  const th = 'px-1.5 py-1 text-[11px] uppercase tracking-wide text-gray-500 font-medium whitespace-nowrap'

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="text-[11px] min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className={`sticky left-0 z-10 bg-gray-50 text-left ${th}`}>Account</th>
              {buckets.map((b) => (
                <th key={b} className={`text-right ${th}`}>
                  {labelOf(b)}
                </th>
              ))}
              <th className={`text-right ${th}`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {cols.map((c) => (
              <tr key={c.key} className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-1.5 py-1 text-gray-700 whitespace-nowrap font-medium">{c.label}</td>
                {buckets.map((b) => (
                  <td key={b} className="px-1.5 py-1 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {cell(cellVal(b, c.key))}
                  </td>
                ))}
                <td className="px-1.5 py-1 text-right tabular-nums font-medium text-gray-900 whitespace-nowrap">
                  {money(colTotals[c.key])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td className="sticky left-0 z-10 bg-gray-50 px-1.5 py-1 text-gray-900">Total</td>
              {buckets.map((b) => (
                <td key={b} className="px-1.5 py-1 text-right tabular-nums text-gray-900 whitespace-nowrap">
                  {money(bucketTotal(b))}
                </td>
              ))}
              <td className="px-1.5 py-1 text-right tabular-nums text-gray-900 whitespace-nowrap">{money(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

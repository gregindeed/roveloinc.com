'use client'

import { useState } from 'react'
import type { SalesEntry, Account, SaleTender } from '@/lib/types'
import { TENDER_LABELS } from '@/lib/types'

// Read-only sales-journal overview: an account × period grid (accounts as rows,
// days or MONTHS as columns) plus a payment-method (tender) breakdown. Pure and
// shared — the admin Sales Journal and the client portal both render it. The
// grid can show DOLLARS or UNIT QUANTITY (qty is what the CDTFA per-tire fee
// needs), and can group by Day or Month (Month defaults for multi-month spans,
// so a full year shows Jan–Dec).

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const num = (n: number) => n.toLocaleString('en-US')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}
const monthKey = (iso: string) => iso.slice(0, 7)
const monthLabel = (ym: string) => {
  const m = ym.split('-')[1]
  return MONTHS[parseInt(m, 10) - 1] ?? m
}
// No-symbol formatter for the dense grid (the tender tiles keep the $).
const gridMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pad2 = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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

type Range = { from: string; to: string }
const TENDER_ORDER: SaleTender[] = ['cash', 'card', 'check', 'ach', 'financing', 'other']

export default function SalesOverview({
  entries,
  accounts,
  periodLabel,
  range,
}: {
  entries: SalesEntry[]
  accounts: Account[]
  periodLabel: string
  range?: Range
}) {
  const [metric, setMetric] = useState<'amount' | 'qty'>('amount')
  const rangeMonths = range ? monthsBetween(range.from, range.to) : null
  const monthsPresent = new Set(entries.map((e) => monthKey(e.entry_date)))
  const multiMonth = rangeMonths ? rangeMonths.length > 1 : monthsPresent.size > 1
  // Group by month across a multi-month range; fall back to days for a single month.
  const gran: 'day' | 'month' = multiMonth ? 'month' : 'day'

  const incomeAccounts = accounts.filter((a) => a.type === 'income')
  const acctLabel = new Map(incomeAccounts.map((a) => [a.id, `${a.code} · ${a.name}`]))

  // Always show active income accounts so the grid stays visible on empty periods.
  const cols = incomeAccounts.filter((a) => a.active || entries.some((e) => e.account_id === a.id))
  const hasUncat = entries.some((e) => !e.account_id || !acctLabel.has(e.account_id))
  const colDefs = [
    ...cols.map((a) => ({ key: a.id, label: `${a.code} · ${a.name}` })),
    ...(hasUncat ? [{ key: '__uncat__', label: 'Uncategorized' }] : []),
  ]

  const bucketOf = (d: string) => (gran === 'month' ? monthKey(d) : d)
  const buckets = range
    ? gran === 'month'
      ? rangeMonths!
      : daysBetween(range.from, range.to)
    : [...new Set(entries.map((e) => bucketOf(e.entry_date)))].sort()
  const labelOf = (b: string) => (gran === 'month' ? monthLabel(b) : fmtDay(b))

  const valueOf = (e: SalesEntry) => (metric === 'amount' ? Number(e.amount) : Number(e.qty) || 0)
  const cellOf = (bucket: string, key: string) =>
    entries
      .filter((e) => bucketOf(e.entry_date) === bucket && (key === '__uncat__' ? !acctLabel.has(e.account_id ?? '') : e.account_id === key))
      .reduce((a, e) => a + valueOf(e), 0)
  const colTotal = (key: string) => buckets.reduce((a, b) => a + cellOf(b, key), 0)
  const grand = entries.reduce((a, e) => a + valueOf(e), 0)
  const fmt = (n: number) => (metric === 'amount' ? gridMoney(n) : num(n))

  const tenderTotal = (t: SaleTender) => entries.filter((e) => e.tender === t).reduce((a, e) => a + Number(e.amount), 0)
  const dollarGrand = entries.reduce((a, e) => a + Number(e.amount), 0)
  const activeTenders = TENDER_ORDER.filter((t) => tenderTotal(t) !== 0)

  return (
    <div className="space-y-8">
      {/* Account × period */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Sales by period · {periodLabel}</h2>
          <Toggle value={metric} onChange={setMetric} options={[['amount', 'Amount ($)'], ['qty', 'Quantity (#)']]} />
        </div>
        {buckets.length === 0 || colDefs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
            No sales recorded in {periodLabel}.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="text-[11px] min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <Th sticky>Revenue stream</Th>
                  {buckets.map((b) => (
                    <Th key={b} right>
                      {labelOf(b)}
                    </Th>
                  ))}
                  <Th right>Total</Th>
                </tr>
              </thead>
              <tbody>
                {colDefs.map((c) => (
                  <tr key={c.key} className="border-t border-gray-100">
                    <Td sticky strong>
                      {c.label}
                    </Td>
                    {buckets.map((b) => {
                      const v = cellOf(b, c.key)
                      return (
                        <Td key={b} right>
                          {v === 0 ? <span className="text-gray-300">–</span> : fmt(v)}
                        </Td>
                      )
                    })}
                    <Td right strong>
                      {fmt(colTotal(c.key))}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <Td sticky>Total</Td>
                  {buckets.map((b) => (
                    <Td key={b} right>
                      {fmt(colDefs.reduce((a, c) => a + cellOf(b, c.key), 0))}
                    </Td>
                  ))}
                  <Td right>{fmt(grand)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Payment-method breakdown (dollars; hidden in quantity view) */}
      {metric === 'amount' && activeTenders.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">By payment method · {periodLabel}</h2>
          <div className="flex flex-wrap gap-3">
            {activeTenders.map((t) => (
              <div key={t} className="rounded-lg border border-gray-200 px-4 py-3 min-w-32">
                <div className="text-sm font-bold text-gray-900 tabular-nums">{money(tenderTotal(t))}</div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{TENDER_LABELS[t]}</div>
              </div>
            ))}
            <div className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-3 min-w-32">
              <div className="text-sm font-bold text-white tabular-nums">{money(dollarGrand)}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-300 mt-1">Total</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            value === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Th({ children, right, sticky }: { children: React.ReactNode; right?: boolean; sticky?: boolean }) {
  return (
    <th
      className={`px-1.5 py-1 text-[11px] uppercase tracking-wide text-gray-500 font-medium whitespace-nowrap ${
        right ? 'text-right' : 'text-left'
      } ${sticky ? 'sticky left-0 z-10 bg-gray-50' : ''}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  right,
  sticky,
  strong,
}: {
  children: React.ReactNode
  right?: boolean
  sticky?: boolean
  strong?: boolean
}) {
  return (
    <td
      className={`px-1.5 py-1 whitespace-nowrap ${right ? 'text-right tabular-nums' : ''} ${
        strong ? 'font-medium text-gray-900' : 'text-gray-700'
      } ${sticky ? 'sticky left-0 z-10 bg-white' : ''}`}
    >
      {children}
    </td>
  )
}

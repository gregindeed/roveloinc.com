'use client'

import { useMemo, useState } from 'react'
import type { Deposit, CheckingExpense, CCTransaction, Account, SalesEntry } from '@/lib/types'
import { computePnl } from '@/lib/pnl'
import PnlStatement from '@/components/PnlStatement'
import { DepositsTable, ExpensesTables } from '@/components/Financials'
import { IncomeGrid, ExpenseGrid } from '@/components/CategoryGrid'
import SalesOverview from '@/components/SalesOverview'

// Client-side financial view for the portal: a date-range filter plus
// Summary / Income / Expenses sub-tabs. All transactions are loaded once by the
// server page; filtering and the P&L recompute happen here in the browser (the
// P&L is a pure, cheap function), so switching periods is instant with no
// round-trip.

type Preset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'quarter' | 'year' | 'custom'
type SubTab = 'summary' | 'income' | 'expenses'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function human(isoStr: string): string {
  const [y, m, d] = isoStr.split('-')
  const mi = parseInt(m, 10) - 1
  if (!y || Number.isNaN(mi) || !MONTHS[mi]) return isoStr
  return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`
}

// Inclusive [from, to] ISO range for the simple presets, or null for "all".
// (Quarter, Year and Custom carry their own state and are handled separately.)
function presetRange(preset: Preset, now: Date): { from: string; to: string } | null {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'today':
      return { from: iso(now), to: iso(now) }
    case 'this_week': {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay()) // back to Sunday
      return { from: iso(start), to: iso(now) }
    }
    case 'this_month':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    default:
      return null
  }
}

function quarterRange(year: number, q: number): { from: string; to: string } {
  const startMonth = (q - 1) * 3
  return { from: iso(new Date(year, startMonth, 1)), to: iso(new Date(year, startMonth + 3, 0)) }
}

function yearRange(year: number): { from: string; to: string } {
  return { from: iso(new Date(year, 0, 1)), to: iso(new Date(year, 11, 31)) }
}

export default function PortalFinancials({
  deposits,
  checking,
  cc,
  accounts,
  salesEntries = [],
}: {
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  accounts: Account[]
  salesEntries?: SalesEntry[]
}) {
  const [now] = useState(() => new Date())
  const [preset, setPreset] = useState<Preset>('this_month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Quarter picker state — defaults to the current quarter/year.
  const [qYear, setQYear] = useState(() => now.getFullYear())
  const [qNum, setQNum] = useState(() => Math.floor(now.getMonth() / 3) + 1)
  // Year picker state — defaults to the current year.
  const [yYear, setYYear] = useState(() => now.getFullYear())
  const [tab, setTab] = useState<SubTab>('summary')
  const [view, setView] = useState<'overview' | 'detail'>('overview')

  const range = useMemo(() => {
    if (preset === 'quarter') return quarterRange(qYear, qNum)
    if (preset === 'year') return yearRange(yYear)
    if (preset === 'custom') return from && to ? { from, to } : null
    return presetRange(preset, now)
  }, [preset, qYear, qNum, yYear, from, to, now])

  const fDep = useMemo(() => (range ? deposits.filter((r) => r.txn_date >= range.from && r.txn_date <= range.to) : deposits), [deposits, range])
  const fChk = useMemo(() => (range ? checking.filter((r) => r.txn_date >= range.from && r.txn_date <= range.to) : checking), [checking, range])
  const fCc = useMemo(() => (range ? cc.filter((r) => r.post_date >= range.from && r.post_date <= range.to) : cc), [cc, range])
  const fSales = useMemo(
    () => (range ? salesEntries.filter((r) => r.entry_date >= range.from && r.entry_date <= range.to) : salesEntries),
    [salesEntries, range]
  )
  const pnl = useMemo(() => computePnl(fDep, fChk, fCc, accounts), [fDep, fChk, fCc, accounts])

  const periodLabel =
    preset === 'quarter'
      ? `Q${qNum} ${qYear}`
      : preset === 'year'
        ? `${yYear}`
        : range
          ? range.from === range.to
            ? human(range.from)
            : `${human(range.from)} – ${human(range.to)}`
          : 'Custom range'

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
  ]

  return (
    <div className="space-y-5">
      {/* Period filter */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = preset === p.key
            return (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Quarter picker: year stepper + Q1–Q4 */}
        {preset === 'quarter' && (
          <div className="flex flex-wrap items-center gap-2">
            <YearStepper year={qYear} onChange={setQYear} />
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((q) => {
                const active = qNum === q
                return (
                  <button
                    key={q}
                    onClick={() => setQNum(q)}
                    className={`rounded-md px-3 py-1 text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    Q{q}
                  </button>
                )
              })}
            </div>
            <span className="text-xs text-gray-400">
              {human(quarterRange(qYear, qNum).from)} – {human(quarterRange(qYear, qNum).to)}
            </span>
          </div>
        )}

        {/* Year picker: year stepper */}
        {preset === 'year' && (
          <div className="flex flex-wrap items-center gap-2">
            <YearStepper year={yYear} onChange={setYYear} />
            <span className="text-xs text-gray-400">
              {human(yearRange(yYear).from)} – {human(yearRange(yYear).to)}
            </span>
          </div>
        )}

        {/* Custom range */}
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-gray-500">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1 text-sm"
            />
            <label className="text-gray-500">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1 text-sm"
            />
            {!(from && to) && <span className="text-xs text-gray-400">Pick both dates to apply.</span>}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <nav className="flex gap-1 border-b border-gray-200">
        {subTabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      {tab === 'summary' && <PnlStatement pnl={pnl} periodLabel={periodLabel} />}

      {(tab === 'income' || tab === 'expenses') && (
        <div className="space-y-3">
          {/* Overview (grid) vs Detail (line items) */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
            {(['overview', 'detail'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${
                  view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {tab === 'income' &&
            (view === 'overview' ? (
              fSales.length > 0 ? (
                <SalesOverview entries={fSales} accounts={accounts} periodLabel={periodLabel} range={range ?? undefined} />
              ) : (
                <IncomeGrid deposits={fDep} accounts={accounts} range={range ?? undefined} />
              )
            ) : (
              <DepositsTable deposits={fDep} periodLabel={periodLabel} />
            ))}
          {tab === 'expenses' &&
            (view === 'overview' ? (
              <ExpenseGrid checking={fChk} cc={fCc} accounts={accounts} range={range ?? undefined} />
            ) : (
              <ExpensesTables checking={fChk} cc={fCc} periodLabel={periodLabel} />
            ))}
        </div>
      )}
    </div>
  )
}

// A compact ‹ 2026 › stepper, shared by the Quarter and Year pickers.
function YearStepper({ year, onChange }: { year: number; onChange: (updater: (y: number) => number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange((y) => y - 1)}
        aria-label="Previous year"
        className="h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300"
      >
        ‹
      </button>
      <span className="w-14 text-center text-sm font-semibold tabular-nums text-gray-900">{year}</span>
      <button
        onClick={() => onChange((y) => y + 1)}
        aria-label="Next year"
        className="h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300"
      >
        ›
      </button>
    </div>
  )
}

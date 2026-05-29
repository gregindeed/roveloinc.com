'use client'

import { useState, useEffect } from 'react'
import { deposits, checkingExpenses, ccTransactions } from './data'

// ─── Computed from actual transaction data (single source of truth) ──────────
const _s = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const _cat = (...cats: string[]) =>
  _s(checkingExpenses.filter(e => cats.includes(e.category)).map(e => e.amount))

// Revenue
const _epx    = _s(deposits.filter(d => d.type === 'EPX Settlement').map(d => d.amount))
const _zelle  = _s(deposits.filter(d => d.type === 'Zelle Received').map(d => d.amount))
const _checks = _s(deposits.filter(d => d.type === 'Check Deposit').map(d => d.amount))
const _refund = _s(deposits.filter(d => d.type === 'Refund').map(d => d.amount))
const _nonop  = _s(deposits.filter(d => d.type === 'Bank Return' || d.type === 'Bank Transfer').map(d => d.amount))
const _rev    = _epx + _zelle + _checks + _refund + _nonop

// COGS
const _tires  = _cat('Inventory-Tires')
const _parts  = _cat('Inventory-Parts & Supplies')
const _cogs   = _tires + _parts
const _gp     = _rev - _cogs

// Operating expenses
const _wages    = _cat('Payroll-Wages')
const _taxes    = _cat('Payroll-Payroll Taxes')
const _benefits = _cat('Payroll-401k', 'Payroll-Workers Comp', 'Payroll-Processing Fees')
const _rent     = _cat('Rent')
const _ins      = _cat('Insurance-Business')
const _equip    = _cat('Equipment Lease')
const _labor    = _cat('Labor/Subcontractors')
const _draw     = _cat('Owner Draw')
const _finchg   = _s(ccTransactions.filter(c => c.category === 'Finance Charges').map(c => c.amount))
const _ccbiz    = _s(ccTransactions.filter(c => !c.personal && c.category !== 'Finance Charges').map(c => c.amount))
const _other    = _s(checkingExpenses.filter(e => ![
  'Inventory-Tires', 'Inventory-Parts & Supplies',
  'Payroll-Wages', 'Payroll-Payroll Taxes', 'Payroll-401k',
  'Payroll-Workers Comp', 'Payroll-Processing Fees',
  'Rent', 'Insurance-Business', 'Equipment Lease',
  'Owner Draw', 'Labor/Subcontractors', 'Credit Card Payment',
].includes(e.category)).map(e => e.amount))
const _opex     = _wages + _taxes + _benefits + _rent + _ins + _equip + _labor + _draw + _finchg + _ccbiz + _other
const _net      = _gp - _opex
const _personal = _s(ccTransactions.filter(c => c.personal).map(c => c.amount))

const ACCESS_PASSWORD = 'Reyes2026'
const STORAGE_KEY = 'rt_auth'
const SYS_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif"

const CLIENT = {
  name: 'Reyes Tires Inc.',
  owner: 'Francisco Reyes',
  address: '8637 Troy St, Spring Valley, CA 91977',
  industry: 'Automotive — Tire Services',
}

const PERIODS: Record<string, {
  label: string; year: string; month: string
  stats: { revenue: number; cogs: number; grossProfit: number; opex: number; netIncome: number }
  expenses: { category: string; amount: number }[]
  revenue: { category: string; amount: number }[]
  reports: { title: string; desc: string; href: string }[]
  notes?: string
}> = {
  '2026-04': {
    label: 'April 2026', year: '2026', month: 'April',
    stats: { revenue: _rev, cogs: _cogs, grossProfit: _gp, opex: _opex, netIncome: _net },
    revenue: [
      { category: 'Card Payments (EPX)', amount: _epx },
      { category: 'Zelle',               amount: _zelle },
      { category: 'Check Deposits',      amount: _checks },
      { category: 'Refunds / Misc',      amount: _refund },
      { category: 'Non-Operating',       amount: _nonop },
    ],
    expenses: [
      { category: 'Inventory – Tires',         amount: _tires    },
      { category: 'Inventory – Parts',          amount: _parts    },
      { category: 'Payroll – Wages',            amount: _wages    },
      { category: 'Payroll – Taxes',            amount: _taxes    },
      { category: 'Payroll – Benefits & Fees',  amount: _benefits },
      { category: 'Rent',                       amount: _rent     },
      { category: 'Insurance',                  amount: _ins      },
      { category: 'Equipment Lease',            amount: _equip    },
      { category: 'Labor / Subcontractors',     amount: _labor    },
      { category: 'Finance Charges',            amount: _finchg   },
      { category: 'CC – Business Charges',      amount: _ccbiz    },
      { category: 'Other Operating',            amount: _other    },
      { category: 'Owner Draw',                 amount: _draw     },
    ],
    reports: [
      { title: 'April 2026 Bookkeeping Workbook', desc: 'Full ledger, P&L, and credit card detail.', href: '/reports/Reyes_Tires_Inc_April2026_Bookkeeping.xlsx' },
    ],
    notes: `$${_personal.toFixed(2)} in personal charges identified across business credit cards. Please review and reimburse or reclassify.`,
  },
}

type View = 'overview' | 'pnl' | 'expenses' | 'transactions' | 'documents'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'pnl',          label: 'Profit & Loss', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'expenses',     label: 'Expenses',      icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { id: 'transactions', label: 'Transactions',  icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { id: 'documents',    label: 'Documents',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtTx(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// Parse MM/DD/YYYY → sortable string
function parseDateSort(s: string) {
  const [m, d, y] = s.split('/')
  return `${y}-${m}-${d}`
}

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// ── Sidebar ───────────────────────────────────────────────
function SidebarContent({ view, setView, periodKey, setPeriodKey, onNavigate }: {
  view: View; setView: (v: View) => void
  periodKey: string; setPeriodKey: (k: string) => void
  onNavigate?: () => void
}) {
  const years = [...new Set(Object.values(PERIODS).map(p => p.year))].sort().reverse()
  return (
    <div className="flex flex-col h-full">
      {/* Client name */}
      <div className="px-3 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-900 truncate">{CLIENT.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span className="text-xs text-gray-400">Active</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-2 py-2 border-b border-gray-100">
        {NAV.map((item) => (
          <button key={item.id} onClick={() => { setView(item.id); onNavigate?.() }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors text-left mb-0.5 ${
              view === item.id
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}>
            <Icon d={item.icon} size={14} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Periods */}
      <div className="px-2 py-2 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-2.5 pt-1 pb-1.5">Period</p>
        {years.map(year => (
          <div key={year}>
            <p className="text-[10px] font-medium text-gray-300 px-2.5 pb-1">{year}</p>
            {Object.entries(PERIODS)
              .filter(([, p]) => p.year === year)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([key, p]) => (
                <button key={key} onClick={() => { setPeriodKey(key); onNavigate?.() }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 ${
                    periodKey === key
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                  }`}>
                  {p.month}
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────
function Overview({ p }: { p: typeof PERIODS[string] }) {
  const s = p.stats
  const kpis = [
    { label: 'Revenue',        value: fmt(s.revenue),     sub: 'Total inflow' },
    { label: 'Gross Profit',   value: fmt(s.grossProfit), sub: `${((s.grossProfit / s.revenue) * 100).toFixed(1)}% margin` },
    { label: 'Expenses',       value: fmt(s.opex),        sub: 'Operating costs' },
    { label: 'Net Income',     value: fmt(s.netIncome),   sub: 'Bottom line', highlight: true },
  ]
  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 rounded-lg overflow-hidden divide-x divide-y md:divide-y-0 divide-gray-200">
        {kpis.map((k) => (
          <div key={k.label} className={`px-4 py-4 ${k.highlight ? 'bg-gray-50' : 'bg-white'}`}>
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={`text-base font-semibold ${k.highlight ? 'text-gray-900' : 'text-gray-900'}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Company info */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-medium text-gray-500">Company Information</p>
        </div>
        <dl className="divide-y divide-gray-100">
          {[
            { label: 'Business', value: CLIENT.name },
            { label: 'Owner', value: CLIENT.owner },
            { label: 'Address', value: CLIENT.address },
            { label: 'Industry', value: CLIENT.industry },
          ].map(({ label, value }) => (
            <div key={label} className="grid grid-cols-3 px-4 py-2.5 bg-white">
              <dt className="text-xs text-gray-400 self-center">{label}</dt>
              <dd className="col-span-2 text-xs font-medium text-gray-900 text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Notice */}
      {p.notes && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3 flex gap-3 items-start">
          <span className="text-amber-500 mt-0.5 shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <div>
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Action Required</p>
            <p className="text-xs text-amber-700 leading-relaxed">{p.notes}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── P&L ───────────────────────────────────────────────────
function ProfitLoss({ p }: { p: typeof PERIODS[string] }) {
  const s = p.stats
  const sections = [
    { title: 'Revenue', rows: p.revenue, total: s.revenue, totalLabel: 'Total Revenue' },
    { title: 'Cost of Goods Sold', rows: p.expenses.filter(e => e.category.startsWith('Inventory')), total: s.cogs, totalLabel: 'Gross Profit', totalValue: s.grossProfit, showGross: true },
    { title: 'Operating Expenses', rows: p.expenses.filter(e => !e.category.startsWith('Inventory')), total: s.opex - s.cogs, totalLabel: 'Net Income', totalValue: s.netIncome, showNet: true },
  ]
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden print:break-inside-avoid">
      <div className="px-4 py-3 print:py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">Profit & Loss Statement</p>
        <p className="text-xs text-gray-400">{p.label}</p>
      </div>
      <table className="w-full">
        <tbody>
          {sections.map((sec, si) => (
            <>
              <tr key={`h-${si}`} className="border-t border-gray-100 first:border-0">
                <td colSpan={2} className="px-4 pt-4 pb-2 print:pt-2 print:pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{sec.title}</span>
                </td>
              </tr>
              {sec.rows.map((r) => (
                <tr key={r.category} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 print:py-1 pl-7 text-xs text-gray-600">{r.category}</td>
                  <td className="px-4 py-2 print:py-1 text-right text-xs font-medium text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.amount)}</td>
                </tr>
              ))}
              <tr key={`t-${si}`} className="border-t border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 print:py-1.5 text-xs font-semibold text-gray-900">
                  {sec.showGross ? 'Gross Profit' : sec.showNet ? 'Net Income' : sec.totalLabel}
                </td>
                <td className="px-4 py-2.5 print:py-1.5 text-right text-xs font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(sec.showGross ? s.grossProfit : sec.showNet ? s.netIncome : sec.total)}
                </td>
              </tr>
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Expenses ──────────────────────────────────────────────
function Expenses({ p }: { p: typeof PERIODS[string] }) {
  const total = p.expenses.reduce((s, e) => s + e.amount, 0)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">Expense Breakdown</p>
        <p className="text-xs text-gray-400">{p.label}</p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Share</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...p.expenses].sort((a, b) => b.amount - a.amount).map((e) => {
            const pct = (e.amount / total) * 100
            return (
              <tr key={e.category} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-900">{e.category}</p>
                  <div className="mt-1.5 h-1 w-24 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-gray-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400 hidden sm:table-cell">{pct.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="px-4 py-2.5 text-xs font-semibold text-gray-900">Total</td>
            <td className="hidden sm:table-cell" />
            <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Documents ─────────────────────────────────────────────
function Documents({ p }: { p: typeof PERIODS[string] }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-medium text-gray-500">Documents & Reports</p>
      </div>
      {p.reports.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-xs text-gray-400">No documents for this period.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {p.reports.map((r) => (
            <li key={r.title} className="flex items-center justify-between px-4 py-3.5 gap-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{r.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                </div>
              </div>
              <a href={r.href} download
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300 bg-white px-3 py-1.5 rounded-md transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Transactions ─────────────────────────────────────────
type TxTab = 'all' | 'deposits' | 'checking' | 'credit-cards'

function Transactions() {
  const [tab, setTab] = useState<TxTab>('all')

  const tabs: { id: TxTab; label: string; count: number }[] = [
    { id: 'all',          label: 'All',              count: deposits.length + checkingExpenses.length + ccTransactions.length },
    { id: 'deposits',     label: 'Deposits',         count: deposits.length },
    { id: 'checking',     label: 'Checking Exp.',    count: checkingExpenses.length },
    { id: 'credit-cards', label: 'Credit Cards',     count: ccTransactions.length },
  ]

  // Normalized combined view
  type NormalizedTx = { sortKey: string; date: string; description: string; category: string; amount: number; dir: 'in' | 'out'; source: 'deposit' | 'checking' | 'cc'; badge?: string; personal?: boolean; checkNum?: string; account?: string }

  const allRows: NormalizedTx[] = [
    ...deposits.map(d => ({
      sortKey: parseDateSort(d.date), date: d.date, description: d.description,
      category: d.category, amount: d.amount, dir: 'in' as const,
      source: 'deposit' as const, badge: d.type,
    })),
    ...checkingExpenses.map(e => ({
      sortKey: parseDateSort(e.date), date: e.date, description: e.description,
      category: e.category, amount: e.amount, dir: 'out' as const,
      source: 'checking' as const, badge: 'Checking', checkNum: e.checkNum || undefined,
    })),
    ...ccTransactions.map(c => ({
      sortKey: parseDateSort(c.postDate), date: c.postDate, description: c.description,
      category: c.category, amount: c.amount, dir: 'out' as const,
      source: 'cc' as const, badge: c.account, personal: c.personal, account: c.account,
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const SOURCE_COLORS: Record<string, string> = {
    deposit:  'bg-emerald-50 text-emerald-700 border-emerald-100',
    checking: 'bg-blue-50 text-blue-700 border-blue-100',
    cc:       'bg-purple-50 text-purple-700 border-purple-100',
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-medium text-gray-500">Transaction Ledger</p>
        <p className="text-xs text-gray-400">April 2026</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-gray-100 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
              tab === t.id
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 bg-white'
            }`}>
            {t.label}
            <span className={`text-[10px] font-semibold px-1 rounded ${tab === t.id ? 'text-gray-300' : 'text-gray-400'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* All tab */}
      {tab === 'all' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Source</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allRows.map((r, i) => (
                <tr key={i} className={`hover:bg-gray-50 transition-colors ${r.personal ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-2.5 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate max-w-[180px] sm:max-w-xs">{r.description}</p>
                    {r.personal && <span className="text-[10px] text-amber-600 font-medium">Personal</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell max-w-[140px]">
                    <span className="truncate block">{r.category}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${SOURCE_COLORS[r.source]}`}>
                      {r.badge}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap ${r.dir === 'in' ? 'text-emerald-600' : 'text-gray-900'}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.dir === 'in' ? '+' : '−'}{fmtTx(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deposits tab */}
      {tab === 'deposits' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deposits.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{d.date}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-900 max-w-[200px] sm:max-w-xs">
                    <span className="truncate block">{d.description}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium bg-emerald-50 text-emerald-700 border-emerald-100">
                      {d.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-600 whitespace-nowrap"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtTx(d.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-900">Total Deposits</td>
                <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  +{fmtTx(deposits.reduce((s, d) => s + d.amount, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Checking Expenses tab */}
      {tab === 'checking' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Check #</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checkingExpenses.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{e.date}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 hidden sm:table-cell">{e.checkNum || '—'}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-900 max-w-[180px] sm:max-w-xs">
                    <span className="truncate block">{e.description}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell max-w-[140px]">
                    <span className="truncate block">{e.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-900 whitespace-nowrap"
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    −{fmtTx(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-900">Total Expenses</td>
                <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  −{fmtTx(checkingExpenses.reduce((s, e) => s + e.amount, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Credit Cards tab */}
      {tab === 'credit-cards' && (
        <>
          {/* Personal charges notice */}
          <div className="mx-4 mt-3 mb-1 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5 flex gap-2.5 items-start">
            <span className="text-amber-500 mt-0.5 shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            <p className="text-xs text-amber-700 leading-relaxed">
              <span className="font-semibold">$1,107.26 in personal charges</span> identified on card ...0214. Items marked below require owner reimbursement or reclassification.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Post Date</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Account</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Category</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ccTransactions.map((c, i) => (
                  <tr key={i} className={`hover:bg-gray-50 transition-colors ${c.personal ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{c.postDate}</td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium bg-purple-50 text-purple-700 border-purple-100">
                        {c.account}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[160px] sm:max-w-xs">
                      <p className="text-xs font-medium text-gray-900 truncate">{c.description}</p>
                      {c.personal && <span className="text-[10px] font-semibold text-amber-600">Personal — review</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden md:table-cell max-w-[140px]">
                      <span className="truncate block">{c.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-900 whitespace-nowrap"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                      −{fmtTx(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-900">Total CC Charges</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    −{fmtTx(ccTransactions.reduce((s, c) => s + c.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────
export default function ReyesTiresPage() {
  const [authed, setAuthed]         = useState(false)
  const [input, setInput]           = useState('')
  const [error, setError]           = useState('')
  const [checked, setChecked]       = useState(false)
  const [view, setView]             = useState<View>('overview')
  const [periodKey, setPeriodKey]   = useState('2026-04')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthed(localStorage.getItem(STORAGE_KEY) === '1')
      setChecked(true)
    }
  }, [])

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setDrawerOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (!checked) return null

  const period = PERIODS[periodKey]

  // ── Login ──
  if (!authed) {
    return (
      <div style={{ fontFamily: SYS_FONT }} className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[340px]">
          <a href="/" className="text-sm font-semibold text-gray-900 block mb-10">
            Rovelo <span className="font-normal text-gray-400" style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic' }}>Inc.</span>
          </a>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Client Portal</p>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Reyes Tires Inc.</h1>
          <p className="text-xs text-gray-400 mb-6">Enter your password to continue.</p>
          <form onSubmit={(e) => {
            e.preventDefault()
            if (input === ACCESS_PASSWORD) { localStorage.setItem(STORAGE_KEY, '1'); setAuthed(true) }
            else { setError('Incorrect password.'); setInput('') }
          }} className="space-y-2.5">
            <input
              type="password" value={input} onChange={e => setInput(e.target.value)}
              placeholder="Password" autoFocus
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" className="w-full bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              Sign in
            </button>
          </form>
          <p className="text-xs text-gray-300 text-center mt-8">Managed by Rovelo Inc.</p>
        </div>
      </div>
    )
  }

  const viewLabel = NAV.find(n => n.id === view)?.label ?? ''

  // ── Portal ──
  return (
    <div style={{ fontFamily: SYS_FONT }}
      className="h-screen flex flex-col bg-gray-50 overflow-hidden print:h-auto print:overflow-visible print:bg-white">

      {/* Header — hidden on print */}
      <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0 z-30 gap-3 print:hidden">
        <button onClick={() => setDrawerOpen(true)} className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-900" aria-label="Menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <a href="/" className="text-sm font-bold text-gray-900 shrink-0">
            Rovelo <span className="font-normal text-gray-400" style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic' }}>Inc.</span>
          </a>
          <span className="text-gray-300 hidden sm:inline">/</span>
          <span className="text-xs text-gray-500 truncate hidden sm:inline">Reyes Tires Inc.</span>
        </div>
        <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setAuthed(false) }}
          className="text-xs text-gray-400 hover:text-gray-900 transition-colors shrink-0">
          Sign out
        </button>
      </header>

      {/* Mobile drawer — hidden on print */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-200 overflow-y-auto">
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
              <span className="text-xs font-semibold text-gray-900">Menu</span>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-900">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <SidebarContent view={view} setView={setView} periodKey={periodKey} setPeriodKey={setPeriodKey} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        {/* Desktop sidebar — hidden on print */}
        <aside className="hidden md:flex w-52 bg-white border-r border-gray-200 flex-col shrink-0 overflow-y-auto print:hidden">
          <SidebarContent view={view} setView={setView} periodKey={periodKey} setPeriodKey={setPeriodKey} />
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 print:overflow-visible print:bg-white">
          <div className="max-w-4xl mx-auto px-5 md:px-8 py-6 print:px-0 print:py-0">

            {/* Print-only report header */}
            <div className="hidden print:block mb-6 pb-4 border-b border-gray-200">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Rovelo Inc. — Confidential Client Report
              </p>
              <h1 className="text-base font-bold text-gray-900">{CLIENT.name}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{period.label} · {viewLabel}</p>
            </div>

            {/* Breadcrumb + Download button */}
            <div className="flex items-center justify-between gap-2 mb-5 print:hidden">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{period.label}</span>
                <span className="text-gray-300 text-xs">/</span>
                <span className="text-xs font-medium text-gray-900">{viewLabel}</span>
              </div>
              {view !== 'documents' && (
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 bg-white px-3 py-1.5 rounded-md transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Download PDF
                </button>
              )}
            </div>

            {view === 'overview'     && <Overview      p={period} />}
            {view === 'pnl'          && <ProfitLoss    p={period} />}
            {view === 'expenses'     && <Expenses      p={period} />}
            {view === 'transactions' && <Transactions />}
            {view === 'documents'    && <Documents     p={period} />}
          </div>
        </main>
      </div>
    </div>
  )
}

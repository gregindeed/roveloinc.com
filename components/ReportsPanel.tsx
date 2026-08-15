'use client'

import { useMemo, useState } from 'react'
import type {
  Client,
  Account,
  Deposit,
  CheckingExpense,
  CCTransaction,
  SalesEntry,
  StatementImportRow,
  Officer,
  SaleTender,
} from '@/lib/types'
import { TENDER_LABELS } from '@/lib/types'
import { computePnl } from '@/lib/pnl'
import { computePosition } from '@/lib/position'
import { downloadCsv } from '@/lib/csv'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const TIRE_FEE_PER_UNIT = 1.75

type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'ytd' | 'all' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'this_year', label: 'This year' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function presetRange(p: Preset, now: Date, from: string, to: string): { from: string; to: string } | null {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (p) {
    case 'this_month':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'this_quarter': {
      const q = Math.floor(m / 3)
      return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }
    }
    case 'this_year':
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) }
    case 'ytd':
      return { from: iso(new Date(y, 0, 1)), to: iso(now) }
    case 'custom':
      return from && to ? { from, to } : null
    case 'all':
      return null
  }
}

export default function ReportsPanel({
  client,
  accounts,
  deposits,
  checking,
  cc,
  salesEntries,
  statements,
  officers,
}: {
  client: Client
  accounts: Account[]
  deposits: Deposit[]
  checking: CheckingExpense[]
  cc: CCTransaction[]
  salesEntries: SalesEntry[]
  statements: StatementImportRow[]
  officers: Officer[]
}) {
  const [now] = useState(() => new Date())
  const [preset, setPreset] = useState<Preset>('this_year')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const range = useMemo(() => presetRange(preset, now, from, to), [preset, now, from, to])
  const label =
    preset === 'all' ? 'All time' : range ? `${range.from} to ${range.to}` : 'Custom'
  const inRange = (d: string) => !range || (d >= range.from && d <= range.to)

  const fDep = deposits.filter((r) => inRange(r.txn_date))
  const fChk = checking.filter((r) => inRange(r.txn_date))
  const fCc = cc.filter((r) => inRange(r.post_date))
  const fSales = salesEntries.filter((r) => inRange(r.entry_date))

  const acctLabel = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]))
  const nameOf = (id: string | null) => (id && acctLabel.get(id)) || 'Uncategorized'
  const pnl = computePnl(fDep, fChk, fCc, accounts)
  const position = computePosition(fDep, fChk, fCc, accounts, statements)
  const slug = `${client.slug}_${(range?.from ?? 'all')}_${(range?.to ?? '')}`.replace(/[^a-z0-9_-]/gi, '')

  // ── CSV builders ──
  const pnlCsv = () => {
    const rows: (string | number)[][] = [[`Profit & Loss — ${client.name}`], [label], []]
    rows.push(['Revenue', ''])
    for (const l of pnl.revenue.lines) rows.push([l.label, l.total])
    if (pnl.revenue.uncategorized) rows.push(['Uncategorized', pnl.revenue.uncategorized])
    rows.push(['Total revenue', pnl.revenue.total], [])
    if (pnl.cogs.lines.length || pnl.cogs.total) {
      rows.push(['Cost of goods sold', ''])
      for (const l of pnl.cogs.lines) rows.push([l.label, l.total])
      rows.push(['Total COGS', pnl.cogs.total], ['Gross profit', pnl.grossProfit], [])
    }
    rows.push(['Operating expenses', ''])
    for (const l of pnl.opex.lines) rows.push([l.label, l.total])
    if (pnl.opex.uncategorized) rows.push(['Uncategorized', pnl.opex.uncategorized])
    rows.push(['Total operating expenses', pnl.opex.total], [], ['Net income', pnl.net])
    downloadCsv(`pnl_${slug}`, rows)
  }

  const incomeCsv = () => {
    const rows: (string | number)[][] = [['Date', 'Description', 'Account', 'Amount']]
    for (const r of fDep) rows.push([r.txn_date, r.description, nameOf(r.account_id), Number(r.amount)])
    downloadCsv(`income_${slug}`, rows)
  }

  const expenseCsv = () => {
    const rows: (string | number)[][] = [['Date', 'Source', 'Description', 'Account', 'Amount']]
    for (const r of fChk) rows.push([r.txn_date, 'Checking', r.description, nameOf(r.account_id), Number(r.amount)])
    for (const r of fCc) rows.push([r.post_date, 'Credit card', r.description, nameOf(r.account_id), Number(r.amount)])
    downloadCsv(`expenses_${slug}`, rows)
  }

  const txnsCsv = () => {
    const rows: (string | number)[][] = [['Date', 'Source', 'Description', 'Account', 'Amount']]
    for (const r of fDep) rows.push([r.txn_date, 'Deposit', r.description, nameOf(r.account_id), Number(r.amount)])
    for (const r of fChk) rows.push([r.txn_date, 'Checking', r.description, nameOf(r.account_id), Number(r.amount)])
    for (const r of fCc) rows.push([r.post_date, 'Credit card', r.description, nameOf(r.account_id), Number(r.amount)])
    downloadCsv(`transactions_${slug}`, rows)
  }

  const salesCsv = () => {
    const rows: (string | number)[][] = [['Date', 'Revenue stream', 'Tender', 'Processor', 'Qty', 'Amount']]
    for (const r of fSales)
      rows.push([
        r.entry_date,
        nameOf(r.account_id),
        TENDER_LABELS[r.tender as SaleTender] ?? r.tender,
        r.processor ?? '',
        r.qty ?? '',
        Number(r.amount),
      ])
    downloadCsv(`sales_journal_${slug}`, rows)
  }

  const positionCsv = () => {
    const rows: (string | number)[][] = [
      [`Financial Position (simplified) — ${client.name}`],
      [label],
      ['NOTE: simplified summary from recorded activity and the latest bank statement — not a full balance sheet.'],
      [],
      ['Cash on hand (latest bank statement)', position.cash ?? 'n/a'],
      ['  as of', position.cashAsOf ?? 'n/a'],
      ['Net income (period)', position.netIncome],
      ["Owner's equity movement (contributions − draws)", position.ownerEquityMovement],
      ['Liabilities movement', position.liabilitiesMovement],
      ['Other assets movement', position.otherAssetsMovement],
    ]
    downloadCsv(`financial_position_${slug}`, rows)
  }

  const businessCsv = () => {
    const c = client
    const rows: (string | number | null)[][] = [
      ['Business Information Sheet', c.name],
      [],
      ['Business name', c.name],
      ['Legal name', c.legal_name],
      ['DBA', c.dba],
      ['Entity type', c.entity_type],
      ['Owner', c.owner_name],
      ['Formation date', c.formation_date],
      ['Fiscal year end', c.fiscal_year_end],
      ['EIN', c.ein],
      ['CA SOS number', c.ca_sos_number],
      ['CDTFA account', c.cdtfa_account],
      ['EDD account', c.edd_account],
      ['FTB ID', c.ftb_id],
      ['NAICS code', c.naics_code],
      ['Business address', c.address],
      ['Mailing address', c.mailing_address],
      ['Phone', c.phone],
      ['Email', c.email],
      ['Website', c.website],
      ['Registered agent', c.registered_agent],
      ['Accounting method', c.accounting_method],
      [],
      ['Officers / ownership', ''],
      ['Name', 'Title', 'Ownership %'],
      ...officers.map((o) => [o.name, o.title ?? '', o.ownership_pct != null ? `${o.ownership_pct}%` : '']),
    ]
    downloadCsv(`business_info_${slug}`, rows as (string | number)[][])
  }

  // CDTFA tire fee: income accounts flagged in their tax_line, summed by qty.
  const tireAccounts = accounts.filter((a) => a.type === 'income' && /tire fee/i.test(a.tax_line ?? ''))
  const tireUnits = (accId: string) =>
    fSales.filter((s) => s.account_id === accId).reduce((a, s) => a + (Number(s.qty) || 0), 0)
  const tireTotalUnits = tireAccounts.reduce((a, acc) => a + tireUnits(acc.id), 0)
  const tireFee = tireTotalUnits * TIRE_FEE_PER_UNIT

  const tireFeeCsv = () => {
    const rows: (string | number)[][] = [
      [`CDTFA Tire Fee Worksheet — ${client.name}`],
      [label],
      [`Rate: $${TIRE_FEE_PER_UNIT.toFixed(2)} per new tire`],
      [],
      ['Account', 'New tires (units)', 'Fee'],
      ...tireAccounts.map((a) => [`${a.code} · ${a.name}`, tireUnits(a.id), tireUnits(a.id) * TIRE_FEE_PER_UNIT]),
      ['Total', tireTotalUnits, tireFee],
    ]
    downloadCsv(`cdtfa_tire_fee_${slug}`, rows)
  }

  const reports: { title: string; desc: string; onClick: () => void; disabled?: boolean }[] = [
    { title: 'Profit & Loss', desc: 'Revenue, COGS, expenses and net income for the period.', onClick: pnlCsv },
    { title: 'Income report', desc: 'Bank deposits with account and amount.', onClick: incomeCsv, disabled: fDep.length === 0 },
    { title: 'Expense report', desc: 'Checking and credit-card expense detail.', onClick: expenseCsv, disabled: fChk.length + fCc.length === 0 },
    { title: 'All transactions', desc: 'Flat export of every transaction in the period.', onClick: txnsCsv, disabled: fDep.length + fChk.length + fCc.length === 0 },
    { title: 'Sales journal', desc: 'Recorded sales by revenue stream, tender and qty.', onClick: salesCsv, disabled: fSales.length === 0 },
    { title: 'Financial position', desc: 'Simplified position — cash, net income, equity movement.', onClick: positionCsv },
    { title: 'Business info sheet', desc: 'EIN, agency IDs, formation, officers — full company record.', onClick: businessCsv },
  ]
  if (tireAccounts.length > 0) {
    reports.push({ title: 'CDTFA tire-fee worksheet', desc: `New-tire units × $${TIRE_FEE_PER_UNIT.toFixed(2)}.`, onClick: tireFeeCsv })
  }

  return (
    <div className="space-y-6">
      {/* Period */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                preset === p.key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-gray-500">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
            <label className="text-gray-500">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-sm" />
          </div>
        )}
      </div>

      {/* Financial position card */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Financial position · {label}</h2>
          <span className="text-[11px] text-gray-400">Simplified — not a full balance sheet</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={position.cashAsOf ? `Cash (as of ${position.cashAsOf})` : 'Cash on hand'} value={position.hasCash ? money(position.cash!) : '—'} />
          <Stat label="Net income" value={money(position.netIncome)} tone={position.netIncome >= 0 ? 'pos' : 'neg'} />
          <Stat label="Owner equity movement" value={money(position.ownerEquityMovement)} />
          <Stat label="Liabilities movement" value={money(position.liabilitiesMovement)} />
        </div>
        {!position.hasCash && (
          <p className="text-xs text-gray-500 mt-3">
            Cash on hand needs a reconciled bank statement on file. Import one to populate it.
          </p>
        )}
      </div>

      {/* Tire fee highlight */}
      {tireAccounts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>CDTFA tire fee · {label}:</strong> {tireTotalUnits} new tire{tireTotalUnits === 1 ? '' : 's'} ×
          ${TIRE_FEE_PER_UNIT.toFixed(2)} = <strong>{money(tireFee)}</strong>{' '}
          <span className="text-amber-700">(from the sales journal qty)</span>
        </div>
      )}

      {/* Report downloads */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Download reports · {label}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reports.map((r) => (
            <button
              key={r.title}
              onClick={r.onClick}
              disabled={r.disabled}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-gray-300 disabled:opacity-40 disabled:hover:border-gray-200 transition-colors"
            >
              <span>
                <span className="block text-sm font-medium text-gray-900">{r.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{r.desc}</span>
              </span>
              <span className="text-xs font-medium text-gray-500 shrink-0">CSV ↓</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Tip: open a CSV in Excel or Google Sheets and print to PDF for a formatted statement.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'text-green-700' : tone === 'neg' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  )
}

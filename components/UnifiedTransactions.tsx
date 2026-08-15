'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '@/lib/coa'
import { setTxnAccount } from '@/app/admin/clients/[slug]/ledger-actions'
import { deleteDeposit, deleteChecking, deleteCC } from '@/app/admin/clients/[slug]/data-actions'
import { SOURCE_LABEL, ledgerTotals, type LedgerTxn, type LedgerSource } from '@/lib/ledger'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const signed = (r: LedgerTxn) => `${r.direction === 'in' ? '+' : '−'}${money(r.amount)}`

const SOURCE_CHIP: Record<LedgerSource, string> = {
  deposit: 'bg-green-50 text-green-700',
  checking: 'bg-gray-100 text-gray-600',
  card: 'bg-violet-50 text-violet-700',
}

type Filter = 'all' | 'in' | 'out'

export default function UnifiedTransactions({
  slug,
  txns,
  accounts,
}: {
  slug: string
  txns: LedgerTxn[]
  accounts: Account[]
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const active = useMemo(() => accounts.filter((a) => a.active), [accounts])
  const totals = useMemo(() => ledgerTotals(txns), [txns])
  const visible = useMemo(
    () => (filter === 'all' ? txns : txns.filter((r) => r.direction === filter)),
    [txns, filter]
  )

  const accountName = (id: string | null) => {
    if (!id) return null
    const a = accounts.find((x) => x.id === id)
    return a ? `${a.code} · ${a.name}` : null
  }

  function categorize(r: LedgerTxn, value: string) {
    setBusyId(r.id)
    startTransition(async () => {
      await setTxnAccount(slug, r.source, r.id, value || null)
      setBusyId(null)
      router.refresh()
    })
  }

  function remove(r: LedgerTxn) {
    setBusyId(r.id)
    startTransition(async () => {
      if (r.source === 'deposit') await deleteDeposit(slug, r.id)
      else if (r.source === 'checking') await deleteChecking(slug, r.id)
      else await deleteCC(slug, r.id)
      setBusyId(null)
      setConfirmId(null)
      router.refresh()
    })
  }

  const Tab = ({ id, label }: { id: Filter; label: string }) => (
    <button
      onClick={() => setFilter(id)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        filter === id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-3">
      {/* Totals strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-200 px-4 py-3">
        <Stat label="Money in" value={money(totals.in)} className="text-green-700" />
        <Stat label="Money out" value={money(totals.out)} className="text-gray-700" />
        <Stat label="Net" value={money(totals.net)} className={totals.net >= 0 ? 'text-green-700' : 'text-red-600'} />
        <div className="ml-auto text-xs text-gray-500">
          {totals.uncategorized > 0 ? (
            <span className="font-medium text-amber-700">{totals.uncategorized} uncategorized</span>
          ) : (
            <span className="text-green-700">All categorized</span>
          )}
        </div>
      </div>

      {/* Filter + count */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Tab id="all" label={`All · ${txns.length}`} />
          <Tab id="in" label="Money in" />
          <Tab id="out" label="Money out" />
        </div>
        {pending && <span className="text-xs text-gray-400">Saving…</span>}
      </div>

      {/* The unified ledger */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Description', 'Source', 'Category', 'Amount', ''].map((h, i) => (
                <th
                  key={h || i}
                  className={`px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium ${
                    i === 4 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={`${r.source}-${r.id}`} className={`border-t border-gray-100 ${r.personal ? 'bg-amber-50/50' : ''}`}>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap tabular-nums">{r.date}</td>
                <td className="px-3 py-1.5 text-gray-800 max-w-[280px] truncate" title={r.description}>
                  {r.description}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_CHIP[r.source]}`}>
                    {SOURCE_LABEL[r.source]}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {r.personal ? (
                    <span className="text-xs text-amber-700">Personal · excluded</span>
                  ) : active.length === 0 ? (
                    <span className="text-xs text-gray-400">{accountName(r.accountId) ?? 'No chart yet'}</span>
                  ) : (
                    <select
                      value={r.accountId ?? ''}
                      disabled={pending && busyId === r.id}
                      onChange={(e) => categorize(r, e.target.value)}
                      className={`min-w-[170px] rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                        r.accountId ? 'border-gray-200 text-gray-900' : 'border-amber-300 text-amber-700 bg-amber-50'
                      }`}
                    >
                      <option value="">Uncategorized</option>
                      {ACCOUNT_TYPE_ORDER.map((t) => {
                        const rows = active.filter((a) => a.type === t)
                        if (rows.length === 0) return null
                        return (
                          <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
                            {rows
                              .slice()
                              .sort((a, b) => a.code.localeCompare(b.code))
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} · {a.name}
                                </option>
                              ))}
                          </optgroup>
                        )
                      })}
                    </select>
                  )}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${
                    r.direction === 'in' ? 'text-green-700' : 'text-gray-800'
                  }`}
                >
                  {signed(r)}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {confirmId === r.id ? (
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => remove(r)} disabled={pending} className="text-xs font-medium text-red-600 hover:text-red-700">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-700">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(r.id)} className="text-xs text-gray-400 hover:text-red-600">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  No transactions in this period yet. Import a statement or run a scan to bring them in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${className ?? 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

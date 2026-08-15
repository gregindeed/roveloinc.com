'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Account } from '@/lib/types'
import { reverseLedgerTxn } from '@/app/admin/clients/[slug]/ledger/actions'

export type LedgerLineRow = {
  id: string
  account_id: string
  debit: number
  credit: number
  description: string | null
}
export type LedgerTxnRow = {
  id: string
  human_id: string | null
  txn_type: string
  document_date: string
  posting_date: string
  status: string
  memo: string | null
  reversal_of_id: string | null
  lines: LedgerLineRow[]
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const TYPE_LABEL: Record<string, string> = {
  manual_journal: 'Journal entry',
  cash_receipt: 'Cash receipt',
  invoice: 'Invoice',
  invoice_payment: 'Payment',
  sales_receipt: 'Sales receipt',
  pos_batch: 'POS batch',
  processor_settlement: 'Settlement',
  transfer: 'Transfer',
  refund: 'Refund',
  expense: 'Expense',
  reversal: 'Reversal',
}

export default function LedgerView({
  slug,
  transactions,
  accounts,
}: {
  slug: string
  transactions: LedgerTxnRow[]
  accounts: Account[]
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const acctName = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, `${a.code} · ${a.name}`]))
    return (id: string) => m.get(id) ?? 'Unknown account'
  }, [accounts])

  // Which originals already have a reversal pointing at them.
  const reversed = useMemo(
    () => new Set(transactions.filter((t) => t.reversal_of_id).map((t) => t.reversal_of_id as string)),
    [transactions]
  )

  const total = (t: LedgerTxnRow) => t.lines.reduce((s, l) => s + Number(l.debit), 0)

  function reverse(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await reverseLedgerTxn(slug, id)
      setBusyId(null)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        No ledger entries yet. Post a journal entry above — or, once bank ingestion posts to the ledger, activity will
        appear here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Ref', 'Type', 'Memo', 'Amount', 'Status', ''].map((h, i) => (
                <th key={i} className={`px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-medium ${i === 4 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const isOpen = openId === t.id
              const canReverse = t.status === 'posted' && t.txn_type !== 'reversal' && !reversed.has(t.id)
              return (
                <Fragment key={t.id}>
                  <tr
                    className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                    onClick={() => setOpenId(isOpen ? null : t.id)}
                  >
                    <td className="px-2.5 py-1.5 text-gray-600 whitespace-nowrap tabular-nums">{t.posting_date}</td>
                    <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{t.human_id ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{TYPE_LABEL[t.txn_type] ?? t.txn_type}</td>
                    <td className="px-2.5 py-1.5 text-gray-800 max-w-[280px] truncate" title={t.memo ?? ''}>{t.memo ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-900">{money(total(t))}</td>
                    <td className="px-2.5 py-1.5">
                      {t.txn_type === 'reversal' ? (
                        <span className="text-gray-500">reversal</span>
                      ) : reversed.has(t.id) ? (
                        <span className="text-gray-400">reversed</span>
                      ) : (
                        <span className="text-green-700 font-medium">posted</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {canReverse && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            reverse(t.id)
                          }}
                          disabled={pending && busyId === t.id}
                          className="text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
                        >
                          {pending && busyId === t.id ? 'Reversing…' : 'Reverse'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={7} className="px-2.5 py-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                              <th className="text-left font-medium py-1">Account</th>
                              <th className="text-left font-medium py-1">Line memo</th>
                              <th className="text-right font-medium py-1">Debit</th>
                              <th className="text-right font-medium py-1">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="py-1 text-gray-800">{acctName(l.account_id)}</td>
                                <td className="py-1 text-gray-500">{l.description ?? ''}</td>
                                <td className="py-1 text-right tabular-nums text-gray-900">{Number(l.debit) ? money(Number(l.debit)) : ''}</td>
                                <td className="py-1 text-right tabular-nums text-gray-900">{Number(l.credit) ? money(Number(l.credit)) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

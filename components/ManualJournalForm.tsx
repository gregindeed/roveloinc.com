'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '@/lib/coa'
import { createManualJournal } from '@/app/admin/clients/[slug]/ledger/actions'

type Line = { accountId: string; debit: string; credit: string; description: string }

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}
const blank = (): Line => ({ accountId: '', debit: '', credit: '', description: '' })

export default function ManualJournalForm({ slug, accounts }: { slug: string; accounts: Account[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>([blank(), blank()])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const active = useMemo(() => accounts.filter((a) => a.active), [accounts])

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + num(l.debit), 0)
    const c = lines.reduce((s, l) => s + num(l.credit), 0)
    return { d: Math.round(d * 100) / 100, c: Math.round(c * 100) / 100 }
  }, [lines])
  const balanced = totals.d === totals.c && totals.d > 0
  const filledLines = lines.filter((l) => l.accountId && (num(l.debit) > 0 || num(l.credit) > 0))
  const canPost = balanced && filledLines.length >= 2 && !!date && !pending

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createManualJournal(slug, {
        documentDate: date,
        memo,
        lines: filledLines.map((l) => ({
          accountId: l.accountId,
          debit: num(l.debit),
          credit: num(l.credit),
          description: l.description,
        })),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setLines([blank(), blank()])
      setMemo('')
      setError(null)
      setOpen(false)
      router.refresh()
    })
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Set up a chart of accounts first (Entity settings → Chart of accounts) before posting entries.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900"
      >
        New journal entry
        <span className="text-xs font-medium text-gray-500">{open ? 'Close' : 'Open'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-gray-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600 flex-1 min-w-[220px]">
              Memo
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="What is this entry for?"
                className="block mt-1 w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Account', 'Description', 'Debit', 'Credit', ''].map((h, i) => (
                    <th key={i} className={`px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-medium ${i >= 2 && i <= 3 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2.5 py-1.5">
                      <select
                        value={l.accountId}
                        onChange={(e) => setLine(i, { accountId: e.target.value })}
                        className="min-w-[170px] border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                      >
                        <option value="">Select…</option>
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
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        value={l.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        className="w-full min-w-[120px] border border-gray-200 rounded-md px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <input
                        inputMode="decimal"
                        value={l.debit}
                        onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })}
                        className="w-24 border border-gray-200 rounded-md px-2 py-1 text-xs text-right tabular-nums"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <input
                        inputMode="decimal"
                        value={l.credit}
                        onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })}
                        className="w-24 border border-gray-200 rounded-md px-2 py-1 text-xs text-right tabular-nums"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {lines.length > 2 && (
                        <button
                          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-xs text-gray-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-medium">
                  <td className="px-2.5 py-1.5 text-gray-500" colSpan={2}>
                    <button onClick={() => setLines((prev) => [...prev, blank()])} className="text-xs text-gray-600 hover:text-gray-900">
                      + Add line
                    </button>
                  </td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-900">{money(totals.d)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-gray-900">{money(totals.c)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs font-medium ${balanced ? 'text-green-700' : 'text-amber-700'}`}>
              {balanced ? '✓ Balanced' : `Out of balance by ${money(Math.abs(totals.d - totals.c))}`}
            </span>
            <button
              onClick={submit}
              disabled={!canPost}
              className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800 disabled:opacity-40"
            >
              {pending ? 'Posting…' : 'Post entry'}
            </button>
          </div>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
      )}
    </div>
  )
}

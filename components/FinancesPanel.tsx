'use client'

import { useMemo, useState } from 'react'
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  usd,
  fmtDate,
  type ExpenseCategory,
  type PropertyExpense,
} from '@/lib/property'

type IncomeItem = { id: string; amount: number; date: string; unitId: string }

const yearOf = (d: string) => Number(d.slice(0, 4))

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'
const btnPrimary = 'rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors'

// Per-property P&L: rent collected (income) − operating expenses = net, for a year.
export default function FinancesPanel({
  propertyId,
  income,
  expenses,
  units,
  canManage,
  addExpense,
  deleteExpense,
}: {
  propertyId: string
  income: IncomeItem[]
  expenses: PropertyExpense[]
  units: { id: string; label: string }[]
  canManage: boolean
  addExpense: (propertyId: string, formData: FormData) => void | Promise<void>
  deleteExpense: (propertyId: string, expenseId: string) => void | Promise<void>
}) {
  const years = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()])
    income.forEach((i) => s.add(yearOf(i.date)))
    expenses.forEach((e) => s.add(yearOf(e.incurred_on)))
    return [...s].sort((a, b) => b - a)
  }, [income, expenses])

  const [year, setYear] = useState<number>(years[0])
  const [adding, setAdding] = useState(false)

  const incYear = income.filter((i) => yearOf(i.date) === year)
  const expYear = expenses.filter((e) => yearOf(e.incurred_on) === year)
  const totalIncome = incYear.reduce((s, i) => s + Number(i.amount || 0), 0)
  const totalExpense = expYear.reduce((s, e) => s + Number(e.amount || 0), 0)
  const net = totalIncome - totalExpense

  const byCategory = useMemo(() => {
    const m = new Map<ExpenseCategory, number>()
    for (const e of expYear) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount || 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [expYear])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Profit &amp; Loss</h2>
          <p className="mt-0.5 text-xs text-gray-400">Rent collected minus operating expenses.</p>
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${input} w-auto`} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Income</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-green-700">{usd(totalIncome)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Expenses</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{usd(totalExpense)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Net</p>
          <p className={`mt-0.5 text-lg font-semibold tabular-nums ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{usd(net)}</p>
        </div>
      </div>

      {/* Expenses by category */}
      {byCategory.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Expenses by category</p>
          <div className="space-y-1.5">
            {byCategory.map(([cat, total]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{EXPENSE_CATEGORY_LABELS[cat]}</span>
                <span className="tabular-nums text-gray-900">{usd(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense ledger */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Expenses</p>
          {canManage && (
            <button type="button" onClick={() => setAdding((a) => !a)} className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900">
              {adding ? 'Close' : '+ Add expense'}
            </button>
          )}
        </div>

        {canManage && adding && (
          <form action={addExpense.bind(null, propertyId)} className="mb-3 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="exp_category">Category</label>
              <select id="exp_category" name="category" defaultValue="utilities" className={input}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="exp_vendor">Vendor</label>
              <input id="exp_vendor" name="vendor" placeholder="e.g. City Water" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="exp_amount">Amount</label>
              <input id="exp_amount" name="amount" inputMode="decimal" required placeholder="0.00" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="exp_date">Date</label>
              <input id="exp_date" name="incurred_on" type="date" className={input} />
            </div>
            {units.length > 1 && (
              <div className="sm:col-span-2">
                <label className={label} htmlFor="exp_unit">Unit</label>
                <select id="exp_unit" name="unit_id" defaultValue="" className={input}>
                  <option value="">Property-wide</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-4">
              <label className={label} htmlFor="exp_desc">Note</label>
              <input id="exp_desc" name="description" placeholder="optional" className={input} />
            </div>
            <div className="col-span-2 sm:col-span-6">
              <button type="submit" className={btnPrimary}>Add expense</button>
            </div>
          </form>
        )}

        {expYear.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses recorded for {year}. Upload a bill in Documents and the Overseer will book it here, or add one manually.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 font-medium">Vendor</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Amount</th>
                  {canManage && <th className="py-1.5 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {expYear.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-900">{fmtDate(e.incurred_on)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-700">
                      {EXPENSE_CATEGORY_LABELS[e.category]}
                      {e.source === 'overseer' && (
                        <span className="ml-1.5 rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-700">Overseer</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{e.vendor || e.description || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-right tabular-nums text-gray-900">{usd(Number(e.amount))}</td>
                    {canManage && (
                      <td className="py-2 text-right">
                        <form action={deleteExpense.bind(null, propertyId, e.id)}>
                          <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600">Delete</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

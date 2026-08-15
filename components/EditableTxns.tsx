import type { Deposit, CheckingExpense, CCTransaction, Account } from '@/lib/types'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '@/lib/coa'
import {
  addDeposit,
  updateDeposit,
  deleteDeposit,
  addChecking,
  updateChecking,
  deleteChecking,
  addCC,
  updateCC,
  deleteCC,
} from '@/app/admin/clients/[slug]/data-actions'

const inp =
  'border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// A server-rendered account picker, grouped by account class.
function AccountSelect({ accounts, defaultValue }: { accounts: Account[]; defaultValue?: string | null }) {
  const active = accounts.filter((a) => a.active)
  return (
    <select name="account_id" defaultValue={defaultValue ?? ''} className={`${inp} min-w-[150px]`}>
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
  )
}

function NoChartHint({ slug }: { slug: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
      No chart of accounts yet — categorize into real accounts by seeding one first in{' '}
      <a href={`/admin/clients/${slug}/account`} className="font-medium underline">
        Entity settings → Chart of accounts
      </a>
      .
    </div>
  )
}

function AddBar({ children, action }: { children: React.ReactNode; action: (fd: FormData) => void }) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
      {children}
      <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
        Add
      </button>
    </form>
  )
}

/* ---------------- Deposits ---------------- */
export function EditableDeposits({
  deposits,
  slug,
  accounts,
}: {
  deposits: Deposit[]
  slug: string
  accounts: Account[]
}) {
  const total = deposits.reduce((a, r) => a + Number(r.amount), 0)
  return (
    <div className="space-y-3">
      {accounts.length === 0 && <NoChartHint slug={slug} />}
      <AddBar action={addDeposit.bind(null, slug)}>
        <input name="txn_date" type="date" required className={inp} />
        <input name="description" placeholder="Description" required className={`${inp} flex-1 min-w-[180px]`} />
        <AccountSelect accounts={accounts} />
        <input name="amount" type="number" step="0.01" placeholder="Amount" required className={`${inp} w-28`} />
      </AddBar>

      <div className="text-xs text-gray-500">
        {deposits.length} deposit{deposits.length === 1 ? '' : 's'} · {money(total)}
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {deposits.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 p-2">
            <form action={updateDeposit.bind(null, slug, String(r.id))} className="flex flex-wrap items-center gap-2 flex-1">
              <input name="txn_date" type="date" defaultValue={r.txn_date} className={inp} />
              <input name="description" defaultValue={r.description} className={`${inp} flex-1 min-w-[160px]`} />
              <AccountSelect accounts={accounts} defaultValue={r.account_id} />
              <input name="amount" type="number" step="0.01" defaultValue={String(r.amount)} className={`${inp} w-28`} />
              <button className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1">
                Save
              </button>
            </form>
            <form action={deleteDeposit.bind(null, slug, String(r.id))}>
              <button className="text-xs text-red-600 hover:text-red-700 px-1">Delete</button>
            </form>
          </div>
        ))}
        {deposits.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            No deposits in this period. Add one above.
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- Expenses (checking + card) ---------------- */
export function EditableExpenses({
  checking,
  cc,
  slug,
  accounts,
}: {
  checking: CheckingExpense[]
  cc: CCTransaction[]
  slug: string
  accounts: Account[]
}) {
  const chkTotal = checking.reduce((a, r) => a + Number(r.amount), 0)
  const ccTotal = cc.reduce((a, r) => a + Number(r.amount), 0)
  return (
    <div className="space-y-8">
      {accounts.length === 0 && <NoChartHint slug={slug} />}
      {/* Checking */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Checking expenses · {money(chkTotal)}</h2>
        <AddBar action={addChecking.bind(null, slug)}>
          <input name="txn_date" type="date" required className={inp} />
          <input name="check_num" placeholder="Check #" className={`${inp} w-24`} />
          <input name="description" placeholder="Description" required className={`${inp} flex-1 min-w-[160px]`} />
          <AccountSelect accounts={accounts} />
          <input name="amount" type="number" step="0.01" placeholder="Amount" required className={`${inp} w-28`} />
        </AddBar>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {checking.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-2">
              <form action={updateChecking.bind(null, slug, String(r.id))} className="flex flex-wrap items-center gap-2 flex-1">
                <input name="txn_date" type="date" defaultValue={r.txn_date} className={inp} />
                <input name="check_num" defaultValue={r.check_num ?? ''} placeholder="Check #" className={`${inp} w-24`} />
                <input name="description" defaultValue={r.description} className={`${inp} flex-1 min-w-[140px]`} />
                <AccountSelect accounts={accounts} defaultValue={r.account_id} />
                <input name="amount" type="number" step="0.01" defaultValue={String(r.amount)} className={`${inp} w-28`} />
                <button className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1">
                  Save
                </button>
              </form>
              <form action={deleteChecking.bind(null, slug, String(r.id))}>
                <button className="text-xs text-red-600 hover:text-red-700 px-1">Delete</button>
              </form>
            </div>
          ))}
          {checking.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500">No checking expenses in this period.</div>
          )}
        </div>
      </div>

      {/* Credit card */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Credit-card activity · {money(ccTotal)}</h2>
        <AddBar action={addCC.bind(null, slug)}>
          <input name="date" type="date" required className={inp} />
          <input name="account" placeholder="Card" className={`${inp} w-24`} />
          <input name="description" placeholder="Description" required className={`${inp} flex-1 min-w-[160px]`} />
          <AccountSelect accounts={accounts} />
          <input name="amount" type="number" step="0.01" placeholder="Amount" required className={`${inp} w-28`} />
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input name="personal" type="checkbox" /> Personal
          </label>
        </AddBar>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {cc.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 p-2 ${r.personal ? 'bg-amber-50' : ''}`}>
              <form action={updateCC.bind(null, slug, String(r.id))} className="flex flex-wrap items-center gap-2 flex-1">
                <input name="date" type="date" defaultValue={r.post_date} className={inp} />
                <input name="account" defaultValue={r.account ?? ''} placeholder="Card" className={`${inp} w-24`} />
                <input name="description" defaultValue={r.description} className={`${inp} flex-1 min-w-[140px]`} />
                <AccountSelect accounts={accounts} defaultValue={r.account_id} />
                <input name="amount" type="number" step="0.01" defaultValue={String(r.amount)} className={`${inp} w-28`} />
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input name="personal" type="checkbox" defaultChecked={r.personal} /> Pers.
                </label>
                <button className="text-xs font-medium text-gray-700 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1">
                  Save
                </button>
              </form>
              <form action={deleteCC.bind(null, slug, String(r.id))}>
                <button className="text-xs text-red-600 hover:text-red-700 px-1">Delete</button>
              </form>
            </div>
          ))}
          {cc.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500">No card activity in this period.</div>
          )}
        </div>
      </div>
    </div>
  )
}

import type { SalesEntry, Account, SaleTender } from '@/lib/types'
import { TENDER_LABELS } from '@/lib/types'
import { addSalesEntry, deleteSalesEntry } from '@/app/admin/clients/[slug]/sales-actions'
import SalesOverview from '@/components/SalesOverview'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}
const TENDER_ORDER: SaleTender[] = ['cash', 'card', 'check', 'ach', 'financing', 'other']

// The admin Sales Journal: staff key in a day's sales by revenue stream + tender.
// The overview (grid + tender totals) is the shared, read-only SalesOverview —
// the exact view the client sees in their portal.
export default function SalesJournal({
  entries,
  incomeAccounts,
  slug,
  periodLabel,
  today,
  range,
}: {
  entries: SalesEntry[]
  incomeAccounts: Account[]
  slug: string
  periodLabel: string
  today: string
  range?: { from: string; to: string }
}) {
  const acctLabel = new Map(incomeAccounts.map((a) => [a.id, `${a.code} · ${a.name}`]))
  const sorted = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))

  return (
    <div className="space-y-8">
      {/* Add a line */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Add a sale</h2>
        {incomeAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">
            Set up income accounts first (Overview → chart of accounts) so sales can be tagged to a revenue stream.
          </p>
        ) : (
          <form action={addSalesEntry.bind(null, slug)} className="flex flex-wrap items-end gap-2">
            <Field label="Date">
              <input type="date" name="entry_date" defaultValue={today} required className="h-8 border border-gray-200 rounded-lg px-2 text-sm" />
            </Field>
            <Field label="Revenue stream">
              <select name="account_id" className="h-8 border border-gray-200 rounded-lg px-2 text-sm min-w-44">
                <option value="">— Uncategorized —</option>
                {incomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tender">
              <select name="tender" defaultValue="card" className="h-8 border border-gray-200 rounded-lg px-2 text-sm">
                {TENDER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {TENDER_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Processor">
              <input name="processor" placeholder="Clover…" className="h-8 border border-gray-200 rounded-lg px-2 text-sm w-24" />
            </Field>
            <Field label="Qty">
              <input name="qty" type="number" inputMode="numeric" className="h-8 border border-gray-200 rounded-lg px-2 text-sm w-16" />
            </Field>
            <Field label="Amount">
              <input name="amount" type="number" step="0.01" inputMode="decimal" required className="h-8 border border-gray-200 rounded-lg px-2 text-sm w-28" />
            </Field>
            <Field label="Memo">
              <input name="memo" className="h-8 border border-gray-200 rounded-lg px-2 text-sm w-32" />
            </Field>
            <button className="h-8 rounded-lg bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-700">Add</button>
          </form>
        )}
      </div>

      {/* Shared overview (grid + tender) — identical to the client's view */}
      <SalesOverview entries={entries} accounts={incomeAccounts} periodLabel={periodLabel} range={range} />

      {/* Detail list with delete */}
      {sorted.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Entries ({sorted.length})</h2>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <Th>Date</Th>
                  <Th>Revenue stream</Th>
                  <Th>Tender</Th>
                  <Th>Qty</Th>
                  <Th right>Amount</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <Td>{fmtDate(e.entry_date)}</Td>
                    <Td>
                      {acctLabel.get(e.account_id ?? '') ?? <span className="text-gray-400">Uncategorized</span>}
                      {e.memo ? <span className="text-gray-400"> · {e.memo}</span> : null}
                    </Td>
                    <Td>
                      {TENDER_LABELS[e.tender]}
                      {e.processor ? <span className="text-gray-400"> ({e.processor})</span> : null}
                    </Td>
                    <Td>{e.qty ?? ''}</Td>
                    <Td right strong>
                      {money(Number(e.amount))}
                    </Td>
                    <Td right>
                      <form action={deleteSalesEntry.bind(null, slug, e.id)}>
                        <button className="text-xs text-gray-400 hover:text-red-600" title="Delete">
                          ✕
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium whitespace-nowrap ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return (
    <td
      className={`px-3 py-2 whitespace-nowrap ${right ? 'text-right tabular-nums' : ''} ${
        strong ? 'font-medium text-gray-900' : 'text-gray-700'
      }`}
    >
      {children}
    </td>
  )
}

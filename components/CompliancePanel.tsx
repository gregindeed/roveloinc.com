import { TEMPLATES } from '@/lib/compliance'
import { AGENCY_LABELS, type Obligation, type ObligationEvent } from '@/lib/types'
import {
  enrollObligation,
  markEventPaid,
  resetEvent,
  removeObligation,
} from '@/app/admin/clients/[slug]/compliance-actions'

const money = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function displayStatus(ev: ObligationEvent, today: string): 'paid' | 'overdue' | 'upcoming' {
  if (ev.status === 'paid' || ev.status === 'filed') return 'paid'
  if (ev.due_date < today) return 'overdue'
  return 'upcoming'
}

export default function CompliancePanel({
  slug,
  obligations,
  events,
  isAdmin,
  currentYear,
}: {
  slug: string
  obligations: Obligation[]
  events: ObligationEvent[]
  isAdmin: boolean
  currentYear: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const byOb = new Map<string, ObligationEvent[]>()
  for (const e of events) {
    const arr = byOb.get(e.obligation_id) ?? []
    arr.push(e)
    byOb.set(e.obligation_id, arr)
  }

  const openOverdue = events.filter((e) => displayStatus(e, today) === 'overdue').length

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Compliance
          {openOverdue > 0 && (
            <span className="ml-2 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
              {openOverdue} overdue
            </span>
          )}
        </h2>
      </div>

      {isAdmin && (
        <form
          action={enrollObligation.bind(null, slug)}
          className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-gray-100"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">Obligation</span>
            <select name="template" className={selectCls} defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">Year</span>
            <input name="year" type="number" defaultValue={currentYear} className={`${selectCls} w-24`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">Amount (est.)</span>
            <input name="amount" type="number" step="0.01" placeholder="optional" className={`${selectCls} w-32`} />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800 transition-colors"
          >
            Add &amp; generate
          </button>
        </form>
      )}

      {obligations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          {isAdmin
            ? 'No obligations yet. Pick one above to generate its schedule.'
            : 'No compliance items on file yet.'}
        </div>
      ) : (
        <div className="space-y-5">
          {obligations.map((ob) => {
            const evs = (byOb.get(ob.id) ?? []).sort((a, b) => a.due_date.localeCompare(b.due_date))
            return (
              <div key={ob.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm font-medium text-gray-900">
                    {ob.label}
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                      {AGENCY_LABELS[ob.agency]}
                    </span>
                  </div>
                  {isAdmin && (
                    <form action={removeObligation.bind(null, slug, ob.id)}>
                      <button type="submit" className="text-xs text-gray-400 hover:text-red-600">
                        Remove
                      </button>
                    </form>
                  )}
                </div>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Period', 'Due', 'Amount', 'Status', ''].map((h, i) => (
                          <th key={i} className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {evs.map((ev) => {
                        const st = displayStatus(ev, today)
                        return (
                          <tr key={ev.id} className={`border-t border-gray-100 ${st === 'overdue' ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-900">{ev.period_label}</td>
                            <td className="px-3 py-2 text-gray-600">{fmtDate(ev.due_date)}</td>
                            <td className="px-3 py-2 text-gray-700 tabular-nums">
                              {st === 'paid' && ev.amount_paid != null ? money(ev.amount_paid) : money(ev.amount_due)}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={st} paidDate={ev.paid_date} />
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {isAdmin &&
                                (st === 'paid' ? (
                                  <form action={resetEvent.bind(null, slug, ev.id)}>
                                    <button type="submit" className="text-xs text-gray-400 hover:text-gray-700">
                                      Undo
                                    </button>
                                  </form>
                                ) : (
                                  <form action={markEventPaid.bind(null, slug, ev.id)}>
                                    <button type="submit" className="text-xs font-medium text-gray-700 hover:text-gray-900">
                                      Mark paid
                                    </button>
                                  </form>
                                ))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const selectCls =
  'border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'

function StatusBadge({ status, paidDate }: { status: 'paid' | 'overdue' | 'upcoming'; paidDate: string | null }) {
  if (status === 'paid') {
    return (
      <span className="text-[11px] font-medium text-green-700">
        Paid{paidDate ? ` · ${fmtDate(paidDate)}` : ''}
      </span>
    )
  }
  if (status === 'overdue') {
    return <span className="text-[11px] font-semibold text-red-700">Overdue</span>
  }
  return <span className="text-[11px] text-gray-500">Upcoming</span>
}

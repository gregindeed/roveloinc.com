import { recomputeEntityState } from '@/app/admin/clients/[slug]/state-actions'
import type { EntityState, Urgency } from '@/lib/entityState'

const toneFor = (score: number) =>
  score >= 80 ? 'green' : score >= 50 ? 'amber' : 'red'

const BAR: Record<string, string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }
const RING: Record<string, string> = {
  green: 'text-green-600 border-green-200 bg-green-50',
  amber: 'text-amber-600 border-amber-200 bg-amber-50',
  red: 'text-red-600 border-red-200 bg-red-50',
}
const DOT: Record<Urgency, string> = {
  overdue: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-gray-400',
  low: 'bg-gray-300',
}

function Meter({ label, score, sub }: { label: string; score: number; sub: string }) {
  const tone = toneFor(score)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs tabular-nums text-gray-500">{score}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{sub}</p>
    </div>
  )
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function ReadinessPanel({ state, slug }: { state: EntityState; slug: string }) {
  const tone = toneFor(state.overall)
  const f = state.financial
  const cmp = state.compliance

  const idSub =
    state.identity.total === 0 ? 'No fields expected' : `${state.identity.have} of ${state.identity.total} fields`
  const docSub =
    state.documents.total === 0 ? 'No documents expected' : `${state.documents.have} of ${state.documents.total} on file`
  const finSub =
    f.monthsExpected === 0
      ? 'No months to cover yet'
      : `${f.monthsCovered}/${f.monthsExpected} months${f.reconciledShare != null ? ` · ${f.reconciledShare}% reconciled` : ''}`
  const cmpSub = !cmp.known
    ? 'No obligations enrolled'
    : `${cmp.overdue} overdue · ${cmp.dueSoon} due soon · ${cmp.done} done`

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start gap-5">
        <div className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border ${RING[tone]}`}>
          <span className="text-2xl font-bold leading-none tabular-nums">{state.overall}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-70">ready</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Readiness</h2>
            <form action={recomputeEntityState.bind(null, slug)}>
              <button className="text-[11px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1">
                Recompute
              </button>
            </form>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Derived from the entity&apos;s data · updated {fmt(state.computedAt)}
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <Meter label="Identity" score={state.identity.score} sub={idSub} />
            <Meter label="Documents" score={state.documents.score} sub={docSub} />
            <Meter label="Financial coverage" score={f.score} sub={finSub} />
            <Meter label="Compliance" score={cmp.score} sub={cmpSub} />
          </div>
        </div>
      </div>

      {state.openActions.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            What&apos;s next · {state.openActions.length}
          </h3>
          <ul className="space-y-1.5">
            {state.openActions.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[a.urgency]}`} />
                <span className="min-w-0 truncate">{a.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.openActions.length === 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4 text-sm text-gray-500">
          Nothing outstanding — this entity&apos;s file looks complete for what we expect.
        </div>
      )}
    </div>
  )
}

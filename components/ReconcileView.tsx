import type { Reconciliation, Lane } from '@/lib/reconcile'
import { LANE_LABELS } from '@/lib/reconcile'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const pct = (n: number) => `${(n * 100).toFixed(2)}%`

export default function ReconcileView({
  rec,
  periodLabel,
  hasSales,
}: {
  rec: Reconciliation
  periodLabel: string
  hasSales: boolean
}) {
  if (!hasSales) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
        No sales recorded in {periodLabel} to reconcile.
        <br />
        Record or import sales in the <span className="font-medium text-gray-700">Sales journal</span> first — then this
        ties them to what actually hit the bank.
      </div>
    )
  }

  const tolerance = Math.max(5, rec.salesTotal * 0.01)
  const ties = Math.abs(rec.variance) <= tolerance
  const feeGap = Math.abs(rec.impliedCardFee - rec.bookedMerchantFees)
  const feeMismatch = rec.impliedCardFee > 0 && rec.bookedMerchantFees > 0 && feeGap > Math.max(5, rec.impliedCardFee * 0.25)

  return (
    <div className="space-y-6">
      {/* Status */}
      <div
        className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 ${
          ties ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div>
          <p className={`text-sm font-semibold ${ties ? 'text-green-800' : 'text-amber-900'}`}>
            {ties ? 'Reconciled — sales tie to the bank' : `Review — ${money(Math.abs(rec.variance))} to explain`}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {periodLabel} · sales less processor fees vs. deposits attributed to sales.
          </p>
        </div>
        <div className={`text-lg font-bold tabular-nums ${ties ? 'text-green-700' : 'text-amber-700'}`}>
          {money(rec.variance)}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Sales (journal)" value={money(rec.salesTotal)} />
        <Tile
          label="Implied card fees"
          value={money(rec.impliedCardFee)}
          sub={rec.impliedCardFeePct != null ? pct(rec.impliedCardFeePct) : undefined}
        />
        <Tile label="Deposits (attributed)" value={money(rec.depositsClassified)} />
        <Tile label="Variance" value={money(rec.variance)} tone={ties ? 'pos' : 'warn'} />
      </div>

      {/* Lane tie-out */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">By tender · {periodLabel}</h2>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <Th>Tender</Th>
                <Th right>Sales</Th>
                <Th right>Deposits</Th>
                <Th right>Difference</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {rec.lanes.map((l) => (
                <tr key={l.lane} className="border-t border-gray-100">
                  <Td>{LANE_LABELS[l.lane]}</Td>
                  <Td right>{money(l.sales)}</Td>
                  <Td right>{money(l.deposits)}</Td>
                  <Td right strong>
                    {money(l.diff)}
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-500">{laneNote(l.lane)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                <Td>Total</Td>
                <Td right>{money(rec.salesTotal)}</Td>
                <Td right>{money(rec.depositsClassified)}</Td>
                <Td right>{money(rec.salesTotal - rec.depositsClassified)}</Td>
                <Td> </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Card fee cross-check */}
      {rec.impliedCardFee > 0 && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${feeMismatch ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-gray-200 text-gray-700'}`}>
          <strong>Card processor fees:</strong> implied {money(rec.impliedCardFee)}
          {rec.impliedCardFeePct != null ? ` (${pct(rec.impliedCardFeePct)})` : ''} from the gross-vs-net gap
          {rec.bookedMerchantFees > 0 ? <> · merchant fees booked to expense: {money(rec.bookedMerchantFees)}</> : null}.
          {feeMismatch && (
            <span className="block mt-1">
              These differ by {money(feeGap)} — worth checking that all processor fees are categorized to the merchant-fee
              account.
            </span>
          )}
          {rec.bookedMerchantFees === 0 && (
            <span className="block mt-1 text-amber-700">
              No merchant fees are booked to an expense account yet — consider recording {money(rec.impliedCardFee)} as
              processor fees so the P&amp;L reflects the true cost of card sales.
            </span>
          )}
        </div>
      )}

      {/* Context notes */}
      <div className="text-xs text-gray-500 space-y-1">
        {rec.unclassifiedDeposits > 0 && (
          <p>
            {money(rec.unclassifiedDeposits)} in deposits ({rec.unclassifiedCount}) couldn&apos;t be matched to a tender by
            description — these may be non-sales money (owner funds, loans, refunds) or just need a clearer bank memo.
          </p>
        )}
        {rec.timingSales > 0 && (
          <p>
            {money(rec.timingSales)} of sales fall in the last few days of {periodLabel} and may settle at the bank next
            period — expected, not a shortfall.
          </p>
        )}
        <p className="text-gray-400">
          Reconciled at the period + tender level. Card deposits are net of processor fees; cash differences usually mean
          undeposited cash on hand.
        </p>
      </div>
    </div>
  )
}

function laneNote(lane: Lane): string {
  if (lane === 'card') return 'deposits are net of processor fees'
  if (lane === 'cash') return 'difference = undeposited cash / variance'
  if (lane === 'check') return 'checks deposited'
  return 'ACH / financing / other'
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'warn' }) {
  const color = tone === 'pos' ? 'text-green-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">
        {label}
        {sub ? <span className="text-gray-400 normal-case"> · {sub}</span> : null}
      </div>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return (
    <td className={`px-3 py-2 whitespace-nowrap ${right ? 'text-right tabular-nums' : ''} ${strong ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
      {children}
    </td>
  )
}

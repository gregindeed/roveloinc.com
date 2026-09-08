import { FILING_STATUS_SHORT, type TaxPosition } from '@/lib/tax'

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const pctInt = (n: number) => `${Math.round(n * 100)}%`

// Rate → bar shade. Light for low brackets, deepening as rates climb.
const RATE_SHADE: Record<number, string> = {
  0.1: 'bg-emerald-200',
  0.12: 'bg-emerald-300',
  0.22: 'bg-emerald-400',
  0.24: 'bg-emerald-500',
  0.32: 'bg-amber-500',
  0.35: 'bg-orange-500',
  0.37: 'bg-red-500',
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const valueColor = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : 'text-gray-900'
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums mt-0.5 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Line({ label, value, note, strong, negative }: { label: string; value: string; note?: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-4 py-2.5 ${strong ? 'bg-gray-50' : ''}`}>
      <div className="min-w-0">
        <span className={`text-sm ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{label}</span>
        {note && <span className="block text-xs text-gray-400">{note}</span>}
      </div>
      <span className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-semibold text-gray-900' : negative ? 'text-gray-500' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

export default function PlanningWorkspace({
  position,
  otherIncome,
  scheduleCNet,
  w2Wages,
}: {
  position: TaxPosition
  otherIncome: number
  scheduleCNet: number
  w2Wages: number
}) {
  const p = position
  const owes = p.balance >= 0
  const barTotal = p.taxableIncome + (p.roomToNextBracket ?? 0)

  return (
    <div className="space-y-6">
      {/* Estimate banner */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
        Federal estimate for {p.year}
        {!p.exactYear && <span> (using the closest year we have tables for)</span>} · filing {FILING_STATUS_SHORT[p.filingStatus]} ·
        standard deduction · simplified self-employment tax{p.qbiDeduction > 0 ? ' and QBI' : ''}. A planning figure, not a filed return.
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Est. total federal tax" value={usd(p.totalTax)} sub={`Income ${usd(p.incomeTax)} + SE ${usd(p.seTax)}`} />
        <Tile label="Effective rate" value={pct(p.effectiveRate)} sub="of total income" />
        <Tile label="Marginal bracket" value={pctInt(p.marginalRate)} sub={p.bracketTop != null ? `top at ${usd(p.bracketTop)}` : 'top bracket'} />
        <Tile
          label={owes ? 'Estimated balance due' : 'Estimated refund'}
          value={usd(Math.abs(p.balance))}
          sub={`${usd(p.withholding)} withheld`}
          tone={owes ? 'bad' : 'good'}
        />
      </div>

      {/* Planning read */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-1.5">
        <p className="text-sm text-gray-800">
          {p.taxableIncome > 0 ? (
            <>
              Taxable income of <span className="font-medium">{usd(p.taxableIncome)}</span> puts this return in the{' '}
              <span className="font-medium">{pctInt(p.marginalRate)}</span> marginal bracket, with an effective federal rate of{' '}
              <span className="font-medium">{pct(p.effectiveRate)}</span>.
            </>
          ) : (
            <>No taxable income after the standard deduction — no federal income tax is estimated for {p.year}.</>
          )}
        </p>
        {p.roomToNextBracket != null && p.taxableIncome > 0 && (
          <p className="text-sm text-gray-500">
            About <span className="font-medium text-gray-700">{usd(p.roomToNextBracket)}</span> of additional taxable income
            would remain in this bracket before the next rate begins — room for a deferral, contribution, or timing move.
          </p>
        )}
        {p.seTax > 0 && (
          <p className="text-sm text-gray-500">
            Self-employment tax of <span className="font-medium text-gray-700">{usd(p.seTax)}</span> is included — a retirement
            plan (SEP/Solo 401k) or S-corp election are the usual levers there.
          </p>
        )}
        {!p.qbiEstimated && (
          <p className="text-sm text-amber-600">
            Income is above the simple QBI threshold, so the 20% qualified-business-income deduction isn&apos;t estimated here —
            it needs the wage/property limits worked by hand.
          </p>
        )}
      </div>

      {/* Bracket fill visualization */}
      {p.slices.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">How taxable income fills the brackets</h2>
          <div className="flex h-8 w-full overflow-hidden rounded-lg border border-gray-200">
            {p.slices.map((s, i) => (
              <div
                key={i}
                className={`${RATE_SHADE[s.rate] ?? 'bg-gray-400'} h-full`}
                style={{ width: `${barTotal > 0 ? (s.amount / barTotal) * 100 : 0}%` }}
                title={`${pctInt(s.rate)} on ${usd(s.amount)} → ${usd(s.tax)}`}
              />
            ))}
            {p.roomToNextBracket != null && p.roomToNextBracket > 0 && (
              <div
                className="h-full bg-gray-100 border-l border-dashed border-gray-300"
                style={{ width: `${barTotal > 0 ? (p.roomToNextBracket / barTotal) * 100 : 0}%` }}
                title={`${usd(p.roomToNextBracket)} of room left in the ${pctInt(p.marginalRate)} bracket`}
              />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {p.slices.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${RATE_SHADE[s.rate] ?? 'bg-gray-400'}`} />
                {pctInt(s.rate)} · {usd(s.amount)} → {usd(s.tax)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Line-by-line breakdown */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-900 px-4 pt-4 pb-1">How the estimate is built</h2>
        <div className="divide-y divide-gray-100">
          <Line label="W-2 wages" value={usd(w2Wages)} />
          <Line label="1099 income" value={usd(otherIncome)} note="treated as ordinary income" />
          <Line label="Schedule C net" value={usd(scheduleCNet)} negative={scheduleCNet < 0} />
          <Line label="Total income" value={usd(p.totalIncome)} strong />
          {p.seTaxDeduction > 0 && <Line label="Less: ½ self-employment tax" value={`(${usd(p.seTaxDeduction)})`} negative />}
          <Line label="Adjusted gross income (AGI)" value={usd(p.agi)} strong />
          <Line label="Less: standard deduction" value={`(${usd(p.standardDeduction)})`} negative />
          {p.qbiDeduction > 0 && <Line label="Less: QBI deduction (est.)" value={`(${usd(p.qbiDeduction)})`} note="20% of qualified business income" negative />}
          <Line label="Taxable income" value={usd(p.taxableIncome)} strong />
          <Line label="Federal income tax" value={usd(p.incomeTax)} />
          {p.seTax > 0 && <Line label="Self-employment tax" value={usd(p.seTax)} />}
          <Line label="Total federal tax" value={usd(p.totalTax)} strong />
          <Line label="Less: federal withholding" value={`(${usd(p.withholding)})`} negative />
          <Line
            label={owes ? 'Estimated balance due' : 'Estimated refund'}
            value={usd(Math.abs(p.balance))}
            strong
          />
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Estimate only — federal, standard deduction, ordinary rates. It doesn&apos;t model itemized deductions, credits, capital
        gains rates, the additional Medicare tax, or state tax. Use it to plan, not to file.
      </p>
    </div>
  )
}

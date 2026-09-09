import { FILING_STATUS_SHORT, type TaxPosition } from '@/lib/tax'
import type { CaTaxPosition } from '@/lib/caTax'
import type { PlanMove, PlanCategory } from '@/lib/taxPlan'
import type { FinancialHealth, HealthStatus } from '@/lib/financialHealth'

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

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  retirement: 'Retirement',
  entity: 'Entity',
  timing: 'Timing',
  compliance: 'Compliance',
}

function MoveCard({ move }: { move: PlanMove }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {CATEGORY_LABEL[move.category]}
          </span>
          <h3 className="text-sm font-semibold text-gray-900 mt-1.5">{move.title}</h3>
        </div>
        {move.estSavings != null && move.estSavings > 0 && (
          <div className="text-right whitespace-nowrap">
            <div className="text-sm font-semibold text-emerald-600 tabular-nums">~{usd(move.estSavings)}</div>
            <div className="text-[10px] text-gray-400">est. {move.confidence === 'directional' ? 'saving*' : 'tax saved'}</div>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-2 leading-relaxed">{move.detail}</p>
      {move.action && (
        <p className="text-xs text-gray-900 mt-2 flex items-start gap-1.5">
          <span className="text-gray-400">→</span>
          <span className="font-medium">{move.action}</span>
        </p>
      )}
    </div>
  )
}

const HEALTH_DOT: Record<HealthStatus, string> = {
  good: 'bg-emerald-500',
  watch: 'bg-amber-500',
  risk: 'bg-red-500',
}

type Scenario = { key: string; label: string; totalTax: number; current: boolean }

export default function PlanningWorkspace({
  position,
  caTax,
  plan,
  health,
  narrative,
  scenarios,
  otherIncome,
  dividends,
  ordinaryDividends,
  longTermGains,
  shortTermGains,
  scheduleCNet,
  w2Wages,
}: {
  position: TaxPosition
  caTax: CaTaxPosition | null
  plan: PlanMove[]
  health: FinancialHealth
  narrative: string
  scenarios: Scenario[]
  otherIncome: number
  dividends: number
  ordinaryDividends: number
  longTermGains: number
  shortTermGains: number
  scheduleCNet: number
  w2Wages: number
}) {
  const p = position
  const isNR = p.residency === 'nonresident'
  const owes = p.balance >= 0
  const barTotal = p.taxableIncome + (p.roomToNextBracket ?? 0)
  const totalSavings = plan.reduce((a, m) => a + (m.estSavings ?? 0), 0)
  const hasDirectional = plan.some((m) => m.confidence === 'directional' && m.estSavings != null)

  // Combined federal + CA figures for the headline tiles.
  const combinedTax = p.totalTax + (caTax?.tax ?? 0)
  const combinedEffective = p.totalIncome > 0 ? combinedTax / p.totalIncome : 0
  const bestScenario = scenarios.length ? scenarios.reduce((b, s) => (s.totalTax < b.totalTax ? s : b)) : null

  return (
    <div className="space-y-6">
      {/* Estimate banner */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-800">
        {isNR ? 'Nonresident (1040-NR)' : caTax ? 'Federal + California' : 'Federal'} estimate for {p.year}
        {!p.exactYear && <span> (nearest year we have tables for)</span>} · filing {FILING_STATUS_SHORT[p.filingStatus]}
        {isNR ? (
          <> · no standard deduction · dividends at {p.dividendRate != null ? `${Math.round(p.dividendRate * 100)}%` : '30%'}</>
        ) : (
          <> · standard deduction{p.qbiDeduction > 0 ? ' · QBI' : ''}{p.qualifiedDividends > 0 ? ' · qualified dividends' : ''}</>
        )}
        . A planning figure, not a filed return.
      </div>

      {/* The Overseer's read */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 mb-2">The Overseer</div>
        <p className="text-[15px] leading-relaxed text-gray-800">{narrative}</p>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile
          label="Est. total tax"
          value={usd(combinedTax)}
          sub={caTax ? `Federal ${usd(p.totalTax)} + CA ${usd(caTax.tax)}` : `Income ${usd(p.incomeTax)} + SE ${usd(p.seTax)}`}
        />
        <Tile label="Effective rate" value={pct(combinedEffective)} sub={caTax ? 'federal + CA' : 'of total income'} />
        {isNR ? (
          <Tile
            label="Dividend rate"
            value={p.dividendRate != null ? pctInt(p.dividendRate) : '30%'}
            sub={p.dividendRate != null && p.dividendRate < 0.3 ? 'treaty rate' : 'statutory FDAP'}
          />
        ) : (
          <Tile
            label="Marginal bracket"
            value={caTax ? `${pctInt(p.marginalRate)} + ${pctInt(caTax.marginalRate)}` : pctInt(p.marginalRate)}
            sub={caTax ? 'federal + CA' : p.bracketTop != null ? `top at ${usd(p.bracketTop)}` : 'top bracket'}
          />
        )}
        <Tile
          label={owes ? 'Federal balance due' : 'Federal refund'}
          value={usd(Math.abs(p.balance))}
          sub={`${usd(p.withholding)} withheld`}
          tone={owes ? 'bad' : 'good'}
        />
      </div>

      {/* Financial-health read */}
      <div className="rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-gray-900">
            <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">{health.score}</span>
            <span className="text-[9px] text-gray-400">/ 100</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Financial health</h2>
              <span className="text-xs font-medium text-gray-500">{health.grade}</span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{health.summary}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {health.factors.map((f) => (
            <div key={f.key} className="flex items-start gap-2.5">
              <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[f.status]}`} />
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{f.label}.</span> {f.note}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Filing-basis comparison — the "best option" for a foreign owner */}
      {scenarios.length > 1 && (
        <div className="rounded-xl border border-gray-200 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Filing basis · federal tax on {usd(dividends + ordinaryDividends)} of dividends</h2>
            {bestScenario && <span className="text-xs text-gray-500">Lowest: <span className="font-semibold text-emerald-600">{bestScenario.label}</span></span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Residency is a facts test (substantial presence / green card), not a free choice — but it drives the number. This
            compares the same income under each basis.
          </p>
          <div className="space-y-2">
            {scenarios.map((s) => {
              const isBest = bestScenario?.key === s.key
              return (
                <div
                  key={s.key}
                  className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
                    s.current ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{s.label}</span>
                    {s.current && <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">current</span>}
                    {isBest && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">lowest</span>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">{usd(s.totalTax)}</span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Set the basis and treaty rate under <span className="font-medium">Entity settings → Tax profile</span>. Estimate only —
            confirm residency and the treaty article before filing.
          </p>
        </div>
      )}

      {/* The plan — ranked moves */}
      {plan.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Plan for {p.year}</h2>
            {totalSavings > 0 && (
              <span className="text-xs text-gray-500">
                Up to <span className="font-semibold text-emerald-600">~{usd(totalSavings)}</span> in estimated savings identified
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.map((m) => (
              <MoveCard key={m.key} move={m} />
            ))}
          </div>
          {hasDirectional && (
            <p className="text-[11px] text-gray-400">
              * Directional estimate — depends on choices (e.g. reasonable compensation) that need a person to finalize.
            </p>
          )}
        </div>
      )}

      {/* Planning read (resident ordinary-bracket framing) */}
      {!isNR && (
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
      )}

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
        {isNR ? (
          <div className="divide-y divide-gray-100">
            {w2Wages > 0 && <Line label="W-2 wages (effectively connected)" value={usd(w2Wages)} />}
            {otherIncome !== 0 && <Line label="Other US income" value={usd(otherIncome)} />}
            {scheduleCNet !== 0 && <Line label="Schedule C net" value={usd(scheduleCNet)} negative={scheduleCNet < 0} />}
            {w2Wages + otherIncome + Math.max(0, scheduleCNet) > 0 && (
              <>
                <Line label="Graduated tax on US income" value={usd(p.incomeTax)} note="1040-NR, no standard deduction" />
              </>
            )}
            <Line label="US-source dividends (FDAP)" value={usd(dividends + ordinaryDividends)} strong />
            <Line
              label={`Dividend tax @ ${p.dividendRate != null ? pctInt(p.dividendRate) : '30%'}`}
              value={usd(p.dividendTax)}
              note={p.dividendRate != null && p.dividendRate < 0.3 ? 'reduced treaty rate' : 'statutory flat rate'}
            />
            {longTermGains + shortTermGains > 0 && (
              <Line
                label="Capital gains — excluded"
                value={usd(longTermGains + shortTermGains)}
                note="nonresident securities gains generally not US-taxed"
                negative
              />
            )}
            <Line label="Total federal tax" value={usd(p.totalTax)} strong />
            <Line label="Less: federal withholding" value={`(${usd(p.withholding)})`} negative />
            <Line label={owes ? 'Estimated balance due' : 'Estimated refund'} value={usd(Math.abs(p.balance))} strong />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {w2Wages > 0 && <Line label="W-2 wages" value={usd(w2Wages)} />}
            {otherIncome !== 0 && <Line label="1099 income" value={usd(otherIncome)} note="ordinary income" />}
            {scheduleCNet !== 0 && <Line label="Schedule C net" value={usd(scheduleCNet)} negative={scheduleCNet < 0} />}
            {ordinaryDividends > 0 && <Line label="Ordinary / REIT dividends" value={usd(ordinaryDividends)} note="ordinary rates" />}
            {shortTermGains > 0 && <Line label="Short-term capital gains" value={usd(shortTermGains)} note="ordinary rates" />}
            {dividends > 0 && <Line label="Qualified dividends" value={usd(dividends)} note="capital-gains rates" />}
            {longTermGains > 0 && <Line label="Long-term capital gains" value={usd(longTermGains)} note="capital-gains rates" />}
            <Line label="Total income" value={usd(p.totalIncome)} strong />
            {p.seTaxDeduction > 0 && <Line label="Less: ½ self-employment tax" value={`(${usd(p.seTaxDeduction)})`} negative />}
            <Line label="Adjusted gross income (AGI)" value={usd(p.agi)} strong />
            <Line label="Less: standard deduction" value={`(${usd(p.standardDeduction)})`} negative />
            {p.qbiDeduction > 0 && <Line label="Less: QBI deduction (est.)" value={`(${usd(p.qbiDeduction)})`} note="20% of qualified business income" negative />}
            <Line label="Taxable income" value={usd(p.taxableIncome)} strong />
            <Line label="Ordinary income tax" value={usd(p.incomeTax - p.dividendTax)} />
            {p.dividendTax > 0 && <Line label="Tax on dividends & long-term gains" value={usd(p.dividendTax)} note="0/15/20% capital-gains rates" />}
            {p.seTax > 0 && <Line label="Self-employment tax" value={usd(p.seTax)} />}
            <Line label="Total federal tax" value={usd(p.totalTax)} strong />
            <Line label="Less: federal withholding" value={`(${usd(p.withholding)})`} negative />
            <Line label={owes ? 'Estimated balance due' : 'Estimated refund'} value={usd(Math.abs(p.balance))} strong />
          </div>
        )}
      </div>

      {/* California breakdown */}
      {caTax && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <h2 className="text-sm font-semibold text-gray-900 px-4 pt-4 pb-1">
            California state tax{!caTax.exactYear && <span className="font-normal text-gray-400"> · {caTax.year} tables</span>}
          </h2>
          <div className="divide-y divide-gray-100">
            <Line label="Federal AGI (starting point)" value={usd(p.agi)} />
            <Line label="Less: CA standard deduction" value={`(${usd(caTax.standardDeduction)})`} negative />
            <Line label="CA taxable income" value={usd(caTax.taxableIncome)} strong />
            <Line label="CA state tax" value={usd(caTax.tax)} strong />
            <Line label="CA effective rate" value={pct(caTax.effectiveRate)} note="of federal AGI" />
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        {isNR ? (
          <>
            Estimate only — Form 1040-NR treatment: no standard deduction, effectively-connected income at graduated rates, and
            US-source dividends as FDAP at the treaty or 30% rate. It doesn&apos;t model state tax, the §871(d) net-rental election,
            or credits, and residency (substantial presence / green card) and the exact treaty article must be confirmed before
            filing. A planning figure, not a filed return.
          </>
        ) : (
          <>
            Estimate only — {caTax ? 'federal and California' : 'federal'}, standard deduction, ordinary and capital-gains rates.
            It doesn&apos;t model itemized deductions, credits{caTax ? ' (including CA exemption credits)' : ''}, the additional
            Medicare/NIIT{caTax ? '' : ', or state tax'}. State withholding isn&apos;t tracked yet, so the refund/owe figure is
            federal only. Use it to plan, not to file.
          </>
        )}
      </p>
    </div>
  )
}

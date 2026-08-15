import Link from 'next/link'
import type { Pnl, PnlSection } from '@/lib/pnl'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function Tile({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'muted' }) {
  const color = tone === 'pos' ? 'text-green-700' : tone === 'neg' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function LineRow({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  return (
    <tr className="border-b border-gray-50">
      <td className={`py-1.5 pl-4 ${muted ? 'text-gray-400 italic' : 'text-gray-700'}`}>{label}</td>
      <td className={`py-1.5 text-right tabular-nums ${muted ? 'text-gray-400' : 'text-gray-900'}`}>{money(amount)}</td>
    </tr>
  )
}

function SectionRows({ heading, section }: { heading: string; section: PnlSection }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {heading}
        </td>
      </tr>
      {section.lines.map((l) => (
        <LineRow key={l.key} label={l.label} amount={l.total} />
      ))}
      {section.uncategorized !== 0 && <LineRow label="Uncategorized" amount={section.uncategorized} muted />}
      {section.lines.length === 0 && section.uncategorized === 0 && (
        <tr className="border-b border-gray-50">
          <td className="py-1.5 pl-4 text-gray-400 italic">None</td>
          <td className="py-1.5 text-right text-gray-400 tabular-nums">{money(0)}</td>
        </tr>
      )}
    </>
  )
}

function SubtotalRow({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'border-t-2 border-gray-300' : 'border-t border-gray-200'}>
      <td className={`py-2 ${strong ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{label}</td>
      <td
        className={`py-2 text-right tabular-nums ${
          strong ? `font-bold ${amount < 0 ? 'text-red-700' : 'text-gray-900'}` : 'font-semibold text-gray-900'
        }`}
      >
        {money(amount)}
      </td>
    </tr>
  )
}

export default function PnlStatement({
  pnl,
  periodLabel,
  categorizeHref,
}: {
  pnl: Pnl
  periodLabel: string
  categorizeHref?: string
}) {
  if (!pnl.hasActivity) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
        No financial activity in {periodLabel}.
      </div>
    )
  }

  const hasCogs = pnl.cogs.lines.length > 0 || pnl.cogs.total !== 0
  const { excluded } = pnl
  const excludedShown = excluded.ownerDraw !== 0 || excluded.cardPayments !== 0 || excluded.other !== 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Revenue" value={money(pnl.revenue.total)} tone="pos" />
        <Tile label="Gross Profit" value={money(pnl.grossProfit)} tone={pnl.grossProfit >= 0 ? 'pos' : 'neg'} />
        <Tile label="Operating Expenses" value={money(pnl.opex.total)} tone="muted" />
        <Tile label="Net Income" value={money(pnl.net)} tone={pnl.net >= 0 ? 'pos' : 'neg'} />
      </div>

      {categorizeHref && pnl.uncategorizedCount > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800 flex items-center justify-between gap-3">
          <span>
            <strong>{pnl.uncategorizedCount}</strong> transaction{pnl.uncategorizedCount === 1 ? '' : 's'} still need an
            account — this P&amp;L is incomplete until they&apos;re categorized.
          </span>
          <Link href={categorizeHref} className="font-medium underline whitespace-nowrap">
            Categorize →
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Profit &amp; Loss · {periodLabel}</h3>
        <table className="w-full text-sm">
          <tbody>
            <SectionRows heading="Revenue" section={pnl.revenue} />
            <SubtotalRow label="Total revenue" amount={pnl.revenue.total} />

            {hasCogs && (
              <>
                <SectionRows heading="Cost of goods sold" section={pnl.cogs} />
                <SubtotalRow label="Total COGS" amount={pnl.cogs.total} />
                <SubtotalRow label="Gross profit" amount={pnl.grossProfit} />
              </>
            )}

            <SectionRows heading="Operating expenses" section={pnl.opex} />
            <SubtotalRow label="Total operating expenses" amount={pnl.opex.total} />

            <SubtotalRow label="Net income" amount={pnl.net} strong />
          </tbody>
        </table>
      </div>

      {(pnl.uncategorizedCard > 0 || excludedShown || pnl.personalFlagged > 0) && (
        <div className="text-xs text-gray-500 space-y-1">
          {pnl.uncategorizedCard > 0 && (
            <p>
              {money(pnl.uncategorizedCard)} in card activity is uncategorized and held out of the P&amp;L until assigned
              (so a card payment isn&apos;t double-counted).
            </p>
          )}
          {excludedShown && (
            <p>
              Excluded from P&amp;L:
              {excluded.ownerDraw !== 0 && ` owner's draw ${money(excluded.ownerDraw)}`}
              {excluded.cardPayments !== 0 && `${excluded.ownerDraw !== 0 ? ' ·' : ''} card payments ${money(excluded.cardPayments)}`}
              {excluded.other !== 0 && ` · transfers ${money(excluded.other)}`}
              .
            </p>
          )}
          {pnl.personalFlagged > 0 && (
            <p className="text-amber-700">
              {money(pnl.personalFlagged)} in personal card charges are flagged — categorize them to Owner&apos;s Draw.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

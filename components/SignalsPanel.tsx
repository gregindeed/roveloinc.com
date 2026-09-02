import { scanEntitySignals, confirmSignal, dismissSignal, undoAutoSatisfy } from '@/app/admin/clients/[slug]/signal-actions'
import type { DetectedSignal, ObligationEvent } from '@/lib/types'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

const fmtDate = (s: string | null) =>
  s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function SignalsPanel({
  slug,
  proposals,
  satisfied,
}: {
  slug: string
  proposals: DetectedSignal[]
  satisfied: ObligationEvent[]
}) {
  const locale = getLocale()
  const nothing = proposals.length === 0 && satisfied.length === 0

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t(locale, 'compliance.detectedTitle')}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {t(locale, 'compliance.detectedSubtitle')}
          </p>
        </div>
        <form action={scanEntitySignals.bind(null, slug)}>
          <button className="shrink-0 text-[11px] font-medium text-violet-700 hover:text-violet-900 border border-violet-200 bg-white rounded-md px-2.5 py-1.5">
            {t(locale, 'compliance.scanTransactions')}
          </button>
        </form>
      </div>

      {nothing && (
        <p className="mt-4 text-sm text-gray-500">
          {t(locale, 'compliance.nothingFlagged')}
        </p>
      )}

      {proposals.length > 0 && (
        <div className="mt-4 space-y-2">
          {proposals.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800 min-w-0">{p.summary}</p>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                  {Math.round(p.confidence * 100)}%
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <form action={confirmSignal.bind(null, slug, p.id)}>
                  <button className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">
                    {t(locale, 'compliance.enroll')}
                  </button>
                </form>
                <form action={dismissSignal.bind(null, slug, p.id)}>
                  <button className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5">{t(locale, 'compliance.dismiss')}</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {satisfied.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {t(locale, 'compliance.autoMarked', { n: satisfied.length })}
          </h3>
          <div className="space-y-1.5">
            {satisfied.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
                <div className="min-w-0 text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{e.period_label}</span>
                  <span className="text-gray-500"> · {t(locale, 'compliance.markedPaid')} {fmtDate(e.paid_date)}</span>
                  {e.amount_paid != null && (
                    <span className="text-gray-500"> · {Number(e.amount_paid).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                  )}
                </div>
                <form action={undoAutoSatisfy.bind(null, slug, e.id)}>
                  <button className="shrink-0 text-xs text-gray-500 hover:text-red-600 px-1">{t(locale, 'compliance.undo')}</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

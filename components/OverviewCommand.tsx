'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateAssessment, updateOverseerContext } from '@/app/admin/clients/[slug]/assess-actions'
import { recomputeEntityState } from '@/app/admin/clients/[slug]/state-actions'
import { useT } from '@/components/I18nProvider'
import type { EntityState, Urgency } from '@/lib/entityState'

type Assessment = { content: string; model: string | null; created_at: string } | null

const DOT: Record<Urgency, string> = {
  overdue: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-gray-300',
  low: 'bg-gray-200',
}

// A compact gauge: label, a value, and a hairline bar. Grayscale by default,
// red only when the number signals a real problem.
function Gauge({ label, value, score, bad }: { label: string; value: string; score: number; bad?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-gray-500">{label}</span>
        <span className={`text-[11px] tabular-nums ${bad ? 'text-red-600' : 'text-gray-500'}`}>{value}</span>
      </div>
      <div className="mt-1 h-[3px] w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${bad ? 'bg-red-400' : 'bg-gray-400'}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
    </div>
  )
}

export default function OverviewCommand({
  slug,
  state,
  assessment,
  context,
}: {
  slug: string
  state: EntityState
  assessment: Assessment
  context?: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [showNext, setShowNext] = useState(false)

  const [ctx, setCtx] = useState<string>(context ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => setMounted(true), [])

  async function saveContext() {
    setSaving(true)
    try {
      await updateOverseerContext(slug, draft)
      setCtx(draft.trim())
      setEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const overall = state.overall
  const overallBad = overall < 50
  const cmp = state.compliance
  const fin = state.financial
  const actions = state.openActions

  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      {/* Gauge strip — quick awareness, not a landlord */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-semibold tabular-nums ${overallBad ? 'text-red-600' : 'text-gray-900'}`}>
            {overall}
          </span>
          <span className="text-[11px] text-gray-400">{t('admin.ready100')}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <form action={recomputeEntityState.bind(null, slug)}>
            <button className="text-gray-400 hover:text-gray-700">{t('admin.recompute')}</button>
          </form>
          <form action={generateAssessment.bind(null, slug, 'overview')}>
            <button className="font-medium text-gray-700 hover:text-gray-900">{assessment ? t('admin.refreshRead') : t('admin.generateRead')}</button>
          </form>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2.5">
        <Gauge label={t('admin.identity')} value={`${state.identity.have}/${state.identity.total}`} score={state.identity.score} bad={state.identity.score < 50} />
        <Gauge label={t('admin.documents')} value={`${state.documents.have}/${state.documents.total}`} score={state.documents.score} bad={state.documents.score < 50} />
        <Gauge label={t('admin.coverage')} value={`${fin.monthsCovered}/${fin.monthsExpected} ${t('admin.monthsUnit')}`} score={fin.score} bad={fin.score < 50} />
        <Gauge
          label={t('admin.compliance')}
          value={cmp.overdue > 0 ? t('admin.nOverdue', { n: cmp.overdue }) : cmp.known ? t('admin.onTrack') : t('admin.notSet')}
          score={cmp.score}
          bad={cmp.overdue > 0}
        />
      </div>

      {/* Overseer read — the actual insight, given the prominence */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('admin.overseerRead')}</span>
          <span className="text-[10px] text-gray-300" suppressHydrationWarning>
            {assessment && mounted ? new Date(assessment.created_at).toLocaleDateString() : ''}
          </span>
        </div>
        {assessment ? (
          <p className="mt-1.5 text-sm text-gray-800 whitespace-pre-line leading-relaxed">{assessment.content}</p>
        ) : (
          <p className="mt-1.5 text-sm text-gray-500">
            {t('admin.noReadPrefix')} <span className="font-medium">{t('admin.generateRead')}</span> {t('admin.noReadSuffix')}
          </p>
        )}
      </div>

      {/* What's next — collapsed by default (progressive disclosure) */}
      {actions.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowNext((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800"
          >
            <span className={`transition-transform ${showNext ? 'rotate-90' : ''}`}>›</span>
            {t('admin.whatsNext')} · {actions.length}
          </button>
          {showNext && (
            <ul className="mt-2 space-y-1">
              {actions.map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[a.urgency]}`} />
                  {a.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Context for the Overseer — quiet until you need it */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{t('admin.contextForOverseer')}</span>
          {!editing && (
            <button
              onClick={() => {
                setDraft(ctx)
                setEditing(true)
              }}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-900"
            >
              {ctx ? t('admin.edit') : t('admin.add')}
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              placeholder={t('admin.contextPlaceholder')}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={saveContext}
                disabled={saving}
                className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
              >
                {saving ? t('admin.saving') : t('admin.save')}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-700">
                {t('admin.cancel')}
              </button>
              <span className="text-[11px] text-gray-400">{t('admin.usedOnEveryRead')}</span>
            </div>
          </div>
        ) : ctx ? (
          <p className="mt-1.5 text-sm text-gray-700 whitespace-pre-line leading-relaxed">{ctx}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">
            {t('admin.noBriefing')}
          </p>
        )}
      </div>
    </div>
  )
}

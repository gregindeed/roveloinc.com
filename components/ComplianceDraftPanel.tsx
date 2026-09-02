'use client'

import { useState, useTransition } from 'react'
import { useT } from '@/components/I18nProvider'
import {
  draftStateSchedule,
  confirmDrafts,
  dismissDrafts,
  promoteDraftsToTemplate,
} from '@/app/admin/clients/[slug]/compliance-actions'

export type DraftObligation = {
  id: string
  label: string
  frequency: string
  events: { id: string; period_label: string; due_date: string }[]
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

const primary = 'text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-40'
const ghost = 'text-sm text-gray-400 hover:text-gray-900 transition-colors disabled:opacity-40'

export default function ComplianceDraftPanel({
  slug,
  state,
  isCalifornia,
  drafts,
  isPlatform,
}: {
  slug: string
  state: string | null
  isCalifornia: boolean
  drafts: DraftObligation[]
  isPlatform: boolean
}) {
  const t = useT()
  const [pending, start] = useTransition()
  const [stateInput, setStateInput] = useState(state ?? '')

  // California is fully covered by the built-in schedule — nothing to draft.
  if (isCalifornia && drafts.length === 0) return null

  // ── The proposed (unverified) schedule ──
  if (drafts.length > 0) {
    return (
      <div className="border border-amber-200 bg-amber-50/40 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('compliance.proposedSchedule')}
            <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
              {t('compliance.unverified')}
            </span>
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {state ? t('compliance.draftedIntroState', { state }) : t('compliance.draftedIntroGeneric')}
        </p>

        <div className="space-y-4">
          {drafts.map((ob) => (
            <div key={ob.id}>
              <div className="text-[13px] font-medium text-gray-900">{ob.label}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{ob.frequency}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {ob.events
                  .slice()
                  .sort((a, b) => a.due_date.localeCompare(b.due_date))
                  .map((e) => (
                    <span key={e.id} className="text-xs text-gray-600">
                      {e.period_label} · <span className="tabular-nums text-gray-500">{fmtDate(e.due_date)}</span>
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-5 mt-5 pt-4 border-t border-amber-200">
          <button onClick={() => start(() => confirmDrafts(slug))} disabled={pending} className={primary}>
            {t('compliance.confirm')}
          </button>
          <button onClick={() => start(() => dismissDrafts(slug))} disabled={pending} className={ghost}>
            {t('compliance.dismiss')}
          </button>
          <button onClick={() => start(() => { const fd = new FormData(); fd.set('state', stateInput); return draftStateSchedule(slug, fd) })} disabled={pending} className={ghost}>
            {t('compliance.redraft')}
          </button>
          {isPlatform && (
            <button onClick={() => start(() => promoteDraftsToTemplate(slug))} disabled={pending} className={`${ghost} ml-auto`}>
              {t('compliance.saveTemplate', { state: state ?? t('compliance.stateWord') })}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── The trigger (no drafts yet, out-of-state) ──
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">{t('compliance.outOfState')}</h2>
      <p className="text-xs text-gray-500 mb-3">
        {state ? t('compliance.outOfStateBodyState', { state }) : t('compliance.outOfStateBodyGeneric')}
      </p>
      <div className="flex items-center gap-3">
        {!state && (
          <input
            value={stateInput}
            onChange={(e) => setStateInput(e.target.value)}
            placeholder={t('compliance.statePlaceholder')}
            className="w-40 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          />
        )}
        <button
          onClick={() => start(() => { const fd = new FormData(); fd.set('state', stateInput); return draftStateSchedule(slug, fd) })}
          disabled={pending || (!state && !stateInput.trim())}
          className={primary}
        >
          {pending ? t('compliance.drafting') : state ? t('compliance.draftSchedule', { state }) : t('compliance.draftScheduleGeneric')}
        </button>
      </div>
    </div>
  )
}

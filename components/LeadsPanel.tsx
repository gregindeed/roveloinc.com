'use client'

import Link from 'next/link'
import LeadStageSelect from './LeadStageSelect'
import { useT } from './I18nProvider'
import { type Lead } from '@/lib/leads'

// The leads pipeline, rendered inline in the dashboard as a table that matches
// the accounts roster — same bordered container, same column rhythm. Adding a
// lead happens on its own page (/admin/leads/new).
const COLS = 'grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center'

export default function LeadsPanel({
  leads,
  canConvert,
  importHref,
  setLeadStage,
  convertLead,
  deleteLead,
}: {
  leads: Lead[]
  canConvert: boolean
  importHref: string
  setLeadStage: (leadId: string, formData: FormData) => void | Promise<void>
  convertLead: (leadId: string) => void | Promise<void>
  deleteLead: (leadId: string) => void | Promise<void>
}) {
  const t = useT()
  const open = leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost').length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Prospective accounts you haven&apos;t onboarded yet. {open} open.</p>
        <div className="flex items-center gap-3.5">
          <Link href="/admin/leads/new" className="text-xs font-medium text-gray-900 transition-colors hover:text-gray-500">
            + {t('admin.addLead')}
          </Link>
          <Link href={importHref} className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-900">
            Import from a file →
          </Link>
        </div>
      </div>

      {/* Roster */}
      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">
            No leads yet.{' '}
            <Link href="/admin/leads/new" className="font-medium text-gray-900 hover:underline">Add one</Link>, or import a list.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className={`${COLS} border-b border-gray-200 bg-gray-50/70 px-4 py-2`}>
            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Account</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Stage</div>
            <div className="hidden text-[10px] font-medium uppercase tracking-wide text-gray-400 md:block">Contact</div>
            <div />
          </div>
          {leads.map((l) => (
            <div key={l.id} className={`${COLS} border-b border-gray-100 px-4 py-2.5 last:border-0`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-gray-900">{l.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{l.kind === 'individual' ? 'Individual' : 'Business'}</span>
                </div>
                <div className="truncate text-[11px] text-gray-400">
                  {l.contact_name || '—'}
                  {l.source ? <span> · via {l.source}</span> : null}
                </div>
              </div>
              <div>
                <LeadStageSelect leadId={l.id} value={l.stage} action={setLeadStage} />
              </div>
              <div className="hidden truncate text-xs text-gray-500 md:block">
                {l.email || l.phone || <span className="text-gray-300">—</span>}
              </div>
              <div className="flex items-center justify-self-end gap-3">
                {l.converted_client_id ? (
                  <span className="text-[11px] text-gray-400">Converted</span>
                ) : canConvert ? (
                  <form action={convertLead.bind(null, l.id)}>
                    <button type="submit" className="text-[11px] font-medium text-green-700 hover:text-green-900">Convert →</button>
                  </form>
                ) : null}
                <form action={deleteLead.bind(null, l.id)}>
                  <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

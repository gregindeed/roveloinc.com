'use client'

import { useRef } from 'react'
import { LEAD_STAGES, LEAD_STAGE_LABELS, LEAD_STAGE_STYLE, type LeadStage } from '@/lib/leads'

// A stage picker that submits its form the moment you change it — so moving a
// lead along the pipeline is a single click, no separate Save.
export default function LeadStageSelect({
  leadId,
  value,
  action,
}: {
  leadId: string
  value: LeadStage
  action: (leadId: string, formData: FormData) => void | Promise<void>
}) {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form ref={ref} action={action.bind(null, leadId)}>
      <select
        name="stage"
        defaultValue={value}
        onChange={() => ref.current?.requestSubmit()}
        aria-label="Stage"
        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 ${LEAD_STAGE_STYLE[value]}`}
      >
        {LEAD_STAGES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STAGE_LABELS[s]}
          </option>
        ))}
      </select>
    </form>
  )
}

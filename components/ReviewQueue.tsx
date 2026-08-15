import { approveReview, rejectReview } from '@/app/admin/clients/[slug]/review-actions'
import { ENTITY_FIELD_LABELS, type FieldReview } from '@/lib/types'

const REASON: Record<string, { label: string; cls: string }> = {
  low_confidence: { label: 'Low confidence', cls: 'bg-amber-50 border-amber-200 text-amber-700' },
  conflict: { label: 'Conflicts with current value', cls: 'bg-red-50 border-red-200 text-red-700' },
  overwrites_verified: { label: 'Would change a verified value', cls: 'bg-red-50 border-red-200 text-red-700' },
}

const label = (f: string) => ENTITY_FIELD_LABELS[f] ?? f

export default function ReviewQueue({ slug, reviews }: { slug: string; reviews: FieldReview[] }) {
  if (reviews.length === 0) return null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <h2 className="text-sm font-semibold text-gray-900">Needs your review · {reviews.length}</h2>
      <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
        The Overseer read these from documents but didn&apos;t apply them automatically — confirm or discard each.
      </p>
      <div className="space-y-2.5">
        {reviews.map((r) => {
          const reason = REASON[r.reason ?? 'low_confidence'] ?? REASON.low_confidence
          return (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{label(r.field)}</span>
                    <span className={`text-[10px] font-medium rounded-full border px-1.5 py-0.5 ${reason.cls}`}>
                      {reason.label}
                    </span>
                    {r.confidence != null && (
                      <span className="text-[10px] text-gray-400">{Math.round(r.confidence * 100)}% sure</span>
                    )}
                  </div>
                  <div className="mt-1.5 text-sm">
                    <span className="text-gray-500">Proposed: </span>
                    <span className="font-medium text-gray-900 break-words">{r.proposed_value}</span>
                  </div>
                  {r.current_value && (
                    <div className="text-sm">
                      <span className="text-gray-500">Current: </span>
                      <span className="text-gray-700 break-words line-through decoration-gray-300">{r.current_value}</span>
                    </div>
                  )}
                  {r.source_doc_name && (
                    <p className="mt-1 text-[11px] text-gray-400">from {r.source_doc_name}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <form action={approveReview.bind(null, slug, r.id)}>
                    <button className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors">
                      Approve
                    </button>
                  </form>
                  <form action={rejectReview.bind(null, slug, r.id)}>
                    <button className="text-xs text-gray-500 hover:text-red-600 px-1.5 py-1.5">Discard</button>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

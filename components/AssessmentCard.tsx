import { generateAssessment } from '@/app/admin/clients/[slug]/assess-actions'

type Assessment = { content: string; model: string | null; created_at: string } | null

export default function AssessmentCard({
  slug,
  scope,
  assessment,
}: {
  slug: string
  scope: string
  assessment: Assessment
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
          Overseer · AI read
        </span>
        <form action={generateAssessment.bind(null, slug, scope)}>
          <button className="text-xs font-medium text-violet-700 hover:text-violet-900">
            {assessment ? 'Refresh' : 'Generate'}
          </button>
        </form>
      </div>
      {assessment ? (
        <>
          <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{assessment.content}</p>
          <p className="text-[10px] text-gray-400 mt-2">
            {assessment.model ?? 'ai'} · {new Date(assessment.created_at).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          No read yet — click <span className="font-medium">Generate</span> for the Overseer&apos;s take.
        </p>
      )}
    </div>
  )
}

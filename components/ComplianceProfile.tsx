import { COMPLIANCE_PROFILE } from '@/lib/compliance'
import { syncComplianceProfile } from '@/app/admin/clients/[slug]/compliance-actions'

export default function ComplianceProfile({
  slug,
  profile,
}: {
  slug: string
  profile: Record<string, boolean>
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Compliance profile</h2>
      <p className="text-xs text-gray-500 mb-3">
        Tell the system how this entity operates. The Compliance schedule (filings, due dates, payments) is built and
        kept in sync from these switches.
      </p>
      <form action={syncComplianceProfile.bind(null, slug)} className="border border-gray-200 rounded-xl p-4">
        <div className="space-y-3">
          {COMPLIANCE_PROFILE.map((p) => (
            <label key={p.field} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name={p.field}
                defaultChecked={!!profile[p.field]}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span>
                <span className="text-sm font-medium text-gray-900">{p.label}</span>
                <span className="block text-xs text-gray-500">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            Turning one on generates this year&apos;s schedule; turning it off removes those items.
          </span>
          <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
            Save &amp; sync schedule
          </button>
        </div>
      </form>
    </div>
  )
}

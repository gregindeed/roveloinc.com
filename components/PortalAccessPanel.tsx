import { invitePortalClient } from '@/app/admin/clients/[slug]/portal-actions'

export default function PortalAccessPanel({
  slug,
  entityName,
  portalEmail,
}: {
  slug: string
  entityName: string
  portalEmail: string | null
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Portal access</h2>
      <p className="text-xs text-gray-500 mb-4">
        The read-only client portal where {entityName} can view their own books. A login is optional — invite them
        whenever they have an email.
      </p>

      {portalEmail ? (
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-sm text-gray-900 font-medium">{portalEmail}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Portal login is active for this entity.</p>
          <form action={invitePortalClient.bind(null, slug)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Re-send / change email</label>
              <input
                name="email"
                type="email"
                placeholder="owner@business.com"
                className="w-64 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
              Send invite
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-700 mb-3">No portal login yet.</p>
          <form action={invitePortalClient.bind(null, slug)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Client email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="owner@business.com"
                className="w-64 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
              Send portal invite
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            We&apos;ll email them a secure, single-use link to set their own password.
          </p>
        </div>
      )}
    </div>
  )
}

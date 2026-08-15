import { inviteCollaborator, revokeEntityAccess } from '@/app/admin/clients/[slug]/access-actions'

type Collaborator = { id: string; email: string }

export default function EntityAccessPanel({
  slug,
  entityName,
  collaborators,
}: {
  slug: string
  entityName: string
  collaborators: Collaborator[]
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Collaborators</h2>
      <p className="text-xs text-gray-500 mb-3">
        External people who can work on <span className="font-medium">{entityName}</span> only. You and any managers
        already have access to every entity.
      </p>

      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        {collaborators.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {collaborators.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-gray-800">{c.email}</span>
                <form action={revokeEntityAccess.bind(null, slug, c.id)}>
                  <button className="text-xs font-medium text-red-600 hover:text-red-700">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No collaborators on this entity yet.</p>
        )}

        <form action={inviteCollaborator.bind(null, slug)} className="flex items-end gap-2 pt-3 border-t border-gray-100">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] font-medium text-gray-600">Invite by email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="bookkeeper@example.com"
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            />
          </label>
          <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
            Add collaborator
          </button>
        </form>
      </div>
    </div>
  )
}

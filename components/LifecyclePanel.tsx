import {
  archiveClient,
  unarchiveClient,
  dissolveClient,
  reactivateClient,
  transferClient,
  deleteClient,
} from '@/app/admin/clients/[slug]/lifecycle-actions'
import type { Client, Organization } from '@/lib/types'

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

function Card({
  title,
  desc,
  children,
  tone = 'default',
}: {
  title: string
  desc: string
  children: React.ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div className={`rounded-xl border p-5 ${tone === 'danger' ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
      <h3 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-800' : 'text-gray-900'}`}>{title}</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{desc}</p>
      {children}
    </div>
  )
}

const btn = 'rounded-lg text-sm font-medium px-3.5 py-2 transition-colors'
const primary = 'text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors'
const subtle = `${btn} border border-gray-200 text-gray-700 hover:text-gray-900`
const danger = `${btn} bg-red-600 text-white hover:bg-red-700`
const input =
  'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

export default function LifecyclePanel({
  c,
  isPlatform,
  firms,
}: {
  c: Client
  isPlatform: boolean
  firms: Organization[]
}) {
  const archived = !!c.archived_at
  const dissolved = !!c.dissolved_date

  return (
    <div className="space-y-5">
      {/* Engagement — archive */}
      <Card
        title="Engagement"
        desc="Whether Rovelo (or the managing firm) is actively working this client. Archiving keeps every book intact and is fully reversible."
      >
        {archived ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Archived {c.archived_at ? `on ${fmtDate(c.archived_at)}` : ''}
            </span>
            <form action={unarchiveClient.bind(null, c.slug)}>
              <button className={subtle}>Restore to active</button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Active engagement
            </span>
            <form action={archiveClient.bind(null, c.slug)}>
              <button className={subtle}>Archive account</button>
            </form>
          </div>
        )}
      </Card>

      {/* Entity status — dissolve */}
      <Card
        title="Entity status"
        desc="Whether the business itself still legally exists. Marking it dissolved keeps the books as a historical record."
      >
        {dissolved ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              Dissolved as of {fmtDate(c.dissolved_date)}
            </span>
            <form action={reactivateClient.bind(null, c.slug)}>
              <button className={subtle}>Mark operating again</button>
            </form>
          </div>
        ) : (
          <form action={dissolveClient.bind(null, c.slug)} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Dissolution date (optional)</label>
              <input type="date" name="dissolved_date" className={input} />
            </div>
            <button className={subtle}>Mark dissolved</button>
          </form>
        )}
      </Card>

      {isPlatform && (
        <>
          {/* Transfer between firms */}
          <Card
            title="Firm assignment"
            desc="Move this account to another partner firm, or offload it back to Rovelo. Every account has a parent firm; Rovelo is the default."
          >
            <form action={transferClient.bind(null, c.slug)} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px]">
                <label className="block text-[11px] text-gray-500 mb-1">Transfer to firm</label>
                <select name="org_id" defaultValue={c.org_id ?? ''} className={input}>
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.is_platform ? ' (Rovelo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button className={primary}>Transfer</button>
            </form>
          </Card>

          {/* Danger zone — permanent delete */}
          <Card
            title="Delete permanently"
            desc="Removes the entity and every book, document, and statement for good. This cannot be undone. Consider archiving instead."
            tone="danger"
          >
            <form action={deleteClient.bind(null, c.slug)} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px]">
                <label className="block text-[11px] text-red-700 mb-1">
                  Type <span className="font-semibold">{c.name}</span> to confirm
                </label>
                <input
                  name="confirm_name"
                  required
                  autoComplete="off"
                  placeholder={c.name}
                  className="border border-red-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                />
              </div>
              <button className={danger}>Delete forever</button>
            </form>
          </Card>
        </>
      )}
    </div>
  )
}

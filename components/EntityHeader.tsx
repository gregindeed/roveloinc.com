import Link from 'next/link'
import { ENTITY_TYPE_LABELS, type Client } from '@/lib/types'

export default function EntityHeader({ c }: { c: Client }) {
  const facts: [string, string | null][] = [
    ['Entity type', c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type] : null],
    ['EIN', c.ein],
    ['CA SOS #', c.ca_sos_number],
    ['CDTFA', c.cdtfa_account],
    ['EDD', c.edd_account],
    ['FTB ID', c.ftb_id],
    ['Formed', c.formation_date],
    ['FY end', c.fiscal_year_end],
    ['NAICS', c.naics_code],
    ['Phone', c.phone],
    ['Email', c.email],
  ]
  const set = facts.filter(([, v]) => v)
  const inactive = c.status && c.status !== 'active'

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{c.name}</h1>
            {inactive && (
              <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 border border-gray-300 rounded-full px-2 py-0.5">
                {c.status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-0.5">
            {c.owner_name ? `${c.owner_name} · ` : ''}
            {c.address ?? ''}
          </p>
        </div>
        <Link
          href={`/admin/clients/${c.slug}/edit`}
          className="text-xs font-medium text-gray-700 hover:text-gray-900 whitespace-nowrap border border-gray-200 rounded-lg px-3 py-1.5"
        >
          Edit profile
        </Link>
      </div>

      {set.length === 0 ? (
        <p className="text-xs text-gray-500 mt-4">
          No entity details yet — click <span className="font-medium">Edit profile</span> to add the
          type, EIN, and California agency accounts.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
          {set.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">{k}</dt>
              <dd className="text-sm text-gray-900 font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

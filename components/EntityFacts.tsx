import { ENTITY_TYPE_LABELS, type Client } from '@/lib/types'

export default function EntityFacts({ c }: { c: Client }) {
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

  if (set.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl p-5">
        <p className="text-xs text-gray-500">
          No entity details yet — click <span className="font-medium">Edit profile</span> to add the
          type, EIN, and California agency accounts.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Entity details</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
        {set.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">{k}</dt>
            <dd className="text-sm text-gray-900 font-medium break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

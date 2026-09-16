import { ENTITY_TYPE_LABELS, FILING_STATUS_LABELS, type Client } from '@/lib/types'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

type Quick = Pick<
  Client,
  'entity_type' | 'ein' | 'cdtfa_account' | 'edd_account' | 'ca_sos_number' | 'status' | 'kind' | 'filing_status' | 'state' | 'residency' | 'tax_id_type'
>

// A one-line facts strip under the entity name. Individuals and businesses are
// different animals, so each shows the fields that actually apply — no EIN /
// CDTFA / EDD / CA SOS noise on a person's return.
export default function EntityQuickBar({ c }: { c: Quick }) {
  const locale = getLocale()

  const items: [string, string | null][] =
    c.kind === 'individual'
      ? [
          ['Filing status', c.filing_status ? FILING_STATUS_LABELS[c.filing_status] ?? c.filing_status : null],
          ['Residency', t(locale, c.residency === 'nonresident' ? 'admin.nonresident' : 'admin.resident')],
          ['Tax ID', c.tax_id_type ? c.tax_id_type.toUpperCase() : null],
          ['State', c.state ?? null],
          [t(locale, 'entity.status'), c.status],
        ]
      : [
          [t(locale, 'entity.type'), c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type] : null],
          ['EIN', c.ein],
          ['CDTFA', c.cdtfa_account],
          ['EDD', c.edd_account],
          ['CA SOS', c.ca_sos_number],
          [t(locale, 'entity.status'), c.status],
        ]

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
      {items.map(([k, v]) => (
        <span key={k} className="text-xs">
          <span className="text-gray-500">{k} </span>
          {v ? <span className="text-gray-900 font-medium">{v}</span> : <span className="text-gray-300">—</span>}
        </span>
      ))}
    </div>
  )
}

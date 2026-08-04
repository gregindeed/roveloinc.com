import { ENTITY_TYPE_LABELS, type Client } from '@/lib/types'

type Quick = Pick<Client, 'entity_type' | 'ein' | 'cdtfa_account' | 'edd_account' | 'ca_sos_number' | 'status'>

export default function EntityQuickBar({ c }: { c: Quick }) {
  const items: [string, string | null][] = [
    ['Type', c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type] : null],
    ['EIN', c.ein],
    ['CDTFA', c.cdtfa_account],
    ['EDD', c.edd_account],
    ['CA SOS', c.ca_sos_number],
    ['Status', c.status],
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

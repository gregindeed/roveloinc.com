import { ENTITY_TYPE_LABELS, type Client, type Officer, type EntityType } from '@/lib/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function val(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

function formedShort(iso: string | null): string {
  if (!iso) return '—'
  const [y, m] = iso.split('-')
  const mi = parseInt(m, 10) - 1
  if (!y || Number.isNaN(mi) || !MONTHS[mi]) return iso
  return `${MONTHS[mi]} ${y}`
}

function fyeShort(v: string | null): string {
  if (!v) return '—'
  const [m, d] = v.split('-')
  const mi = parseInt(m, 10) - 1
  if (Number.isNaN(mi) || !MONTHS[mi]) return v
  return `${MONTHS[mi]} ${parseInt(d, 10)}`
}

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
function fullDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const mi = parseInt(m, 10) - 1
  if (!y || Number.isNaN(mi) || !MONTHS_FULL[mi]) return iso
  return `${MONTHS_FULL[mi]} ${parseInt(d, 10)}, ${y}`
}

function locationLine(address: string | null): string | null {
  if (!address) return null
  const parts = address.split(',').map((s) => s.trim())
  if (parts.length < 3) return null
  const city = parts[parts.length - 2]
  const state = parts[parts.length - 1].split(/\s+/)[0]
  return `${city}, ${state}`
}

function Row({ label, value, lines }: { label: string; value?: string; lines?: string[] }) {
  return (
    <div className="doc-row">
      <span className="doc-row-label">{label}</span>
      {lines ? (
        <span className="doc-row-val">
          {lines.map((l, i) => (
            <span key={i} className="doc-row-line">{l}</span>
          ))}
        </span>
      ) : (
        <span className="doc-row-val">{value}</span>
      )}
    </div>
  )
}

function addressLines(v: string | null): { lines?: string[]; value?: string } {
  if (!v) return { value: '—' }
  const parts = v.split(',').map((s) => s.trim())
  if (parts.length < 2) return { value: v }
  return { lines: [parts[0], parts.slice(1).join(', ')] }
}

export default function EntityPrintDoc({
  c,
  officers,
  generatedOn,
}: {
  c: Client
  officers: Officer[]
  generatedOn: string
}) {
  const typeLabel = c.entity_type ? ENTITY_TYPE_LABELS[c.entity_type as EntityType] : '—'
  const statusLabel = (c.status ?? 'active').charAt(0).toUpperCase() + (c.status ?? 'active').slice(1)
  const loc = locationLine(c.address)
  const subtitle = [typeLabel !== '—' ? typeLabel : null, loc, `As of ${generatedOn}`].filter(Boolean).join('  ·  ')
  const biz = addressLines(c.address)
  const mail = addressLines(c.mailing_address)

  return (
    <div className="print-only entity-doc">
      {/* Top label strip (no logo) */}
      <header className="doc-head">
        <div className="doc-head-label">Entity Information Sheet</div>
        <div className="doc-head-conf">Confidential</div>
      </header>

      {/* Title + status */}
      <div className="doc-title-row">
        <div>
          <h1 className="doc-title">{c.name}</h1>
          <div className="doc-subtitle">{subtitle}</div>
        </div>
        <div className="doc-status">
          <span className="doc-status-dot">●</span> {statusLabel}
        </div>
      </div>

      {/* Key facts */}
      <div className="doc-keyfacts">
        <div><span>Entity type</span><b>{typeLabel}</b></div>
        <div><span>Formed</span><b>{formedShort(c.formation_date)}</b></div>
        <div><span>Fiscal year-end</span><b>{fyeShort(c.fiscal_year_end)}</b></div>
        <div><span>EIN</span><b>{val(c.ein)}</b></div>
      </div>

      {/* Body */}
      <div className="doc-cols">
        <div className="doc-col">
          <section className="doc-section">
            <div className="doc-section-title">Identity</div>
            <Row label="Business name" value={val(c.name)} />
            <Row label="Legal name" value={val(c.legal_name)} />
            <Row label="DBA / trade name" value={val(c.dba)} />
            <Row label="Owner" value={val(c.owner_name)} />
            <Row label="Formation date" value={fullDate(c.formation_date)} />
          </section>

          <section className="doc-section">
            <div className="doc-section-title">Tax accounts &amp; registrations</div>
            <Row label="EIN (IRS)" value={val(c.ein)} />
            <Row label="CDTFA seller’s permit" value={val(c.cdtfa_account)} />
            <Row label="EDD (payroll)" value={val(c.edd_account)} />
            <Row label="CA SOS number" value={val(c.ca_sos_number)} />
            <Row label="FTB entity ID" value={val(c.ftb_id)} />
            <Row label="NAICS code" value={val(c.naics_code)} />
          </section>
        </div>

        <div className="doc-col">
          <section className="doc-section">
            <div className="doc-section-title">Contact</div>
            <Row label="Business address" {...biz} />
            <Row label="Mailing address" {...mail} />
            <Row label="Phone" value={val(c.phone)} />
            <Row label="Email" value={val(c.email)} />
            <Row label="Website" value={val(c.website)} />
          </section>

          <section className="doc-section">
            <div className="doc-section-title">Registered agent</div>
            <Row label="Agent name" value={val(c.registered_agent)} />
            <Row label="Agent address" value={val(c.registered_agent_address)} />
          </section>

          <section className="doc-section">
            <div className="doc-section-title">Accounting</div>
            <Row label="Accounting method" value={c.accounting_method ? (c.accounting_method.charAt(0).toUpperCase() + c.accounting_method.slice(1)) : '—'} />
            <Row label="Employees" value={val(c.employee_count)} />
          </section>

          <section className="doc-section">
            <div className="doc-section-title">Officers &amp; ownership</div>
            {officers.length > 0 ? (
              officers.map((o) => (
                <Row
                  key={o.id}
                  label={o.name}
                  value={[o.title, o.ownership_pct != null ? `${o.ownership_pct}%` : null].filter(Boolean).join(' · ') || '—'}
                />
              ))
            ) : (
              <div className="doc-empty">None added yet.</div>
            )}
          </section>

          <section className="doc-section">
            <div className="doc-section-title">Notes</div>
            {c.notes ? <div className="doc-notes">{c.notes}</div> : <div className="doc-empty">No notes on file.</div>}
          </section>
        </div>
      </div>

      {/* Footer — subtle Rovelo mark */}
      <footer className="doc-foot">
        <div className="doc-foot-mark">Rovelo<span className="doc-foot-dot">.</span></div>
        <div className="doc-foot-meta">Business Advisory &amp; Solutions · Confidential</div>
      </footer>
    </div>
  )
}

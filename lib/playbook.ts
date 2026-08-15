// ── The entity "playbook" ────────────────────────────────────────────────────
// The normative model — "what a complete file looks like" — kept in DATA, not in
// a prompt, so it's inspectable and tunable. Given an entity's type and its
// compliance profile, it says which identity fields and which documents a
// well-organized business of that shape is expected to have on file. The Entity
// State compute diffs reality against this to produce completeness scores.

import type { Client } from '@/lib/types'

export type FieldReq = { key: keyof Client; label: string }
export type DocReq = { key: string; label: string } // key = documents.doc_type

// Corporate-style entities that have formal formation + ongoing SOS filings.
const FORMAL = new Set(['partnership', 'llc', 's_corp', 'c_corp', 'nonprofit'])
// Entities that file a CA Statement of Information.
const FILES_SOI = new Set(['llc', 's_corp', 'c_corp', 'nonprofit'])

function dedupe<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (seen.has(r.key)) continue
    seen.add(r.key)
    out.push(r)
  }
  return out
}

// Identity fields this entity is expected to have populated.
export function expectedIdentityFields(c: Client): FieldReq[] {
  const t = c.entity_type ?? undefined
  const formal = !!t && FORMAL.has(t)

  const fields: FieldReq[] = [
    { key: 'entity_type', label: 'Business type' },
    { key: 'owner_name', label: 'Owner name' },
    { key: 'address', label: 'Business address' },
    { key: 'accounting_method', label: 'Accounting basis' },
  ]

  if (formal) {
    fields.push(
      { key: 'legal_name', label: 'Legal name' },
      { key: 'ein', label: 'EIN' },
      { key: 'ca_sos_number', label: 'CA SOS number' },
      { key: 'formation_date', label: 'Formation date' },
      { key: 'ftb_id', label: 'FTB entity ID' }
    )
  }

  // Conditional on how the business actually operates (compliance profile).
  if (c.collects_sales_tax) fields.push({ key: 'cdtfa_account', label: 'CDTFA account' })
  if (c.has_employees) {
    fields.push({ key: 'edd_account', label: 'EDD account' })
    if (!formal) fields.push({ key: 'ein', label: 'EIN' }) // a sole prop with payroll needs an EIN
  }

  return dedupe(fields as unknown as { key: string; label: string }[]) as unknown as FieldReq[]
}

// Documents a complete file for this entity should contain.
export function expectedDocuments(c: Client): DocReq[] {
  const t = c.entity_type ?? undefined
  const formal = !!t && FORMAL.has(t)

  const docs: DocReq[] = []
  if (formal) {
    docs.push(
      { key: 'articles', label: 'Articles of Inc./Org.' },
      { key: 'ein_letter', label: 'EIN Letter (CP-575)' }
    )
    if (t && FILES_SOI.has(t)) docs.push({ key: 'statement_of_information', label: 'Statement of Information' })
  }
  docs.push({ key: 'business_license', label: 'Business License' })
  if (c.collects_sales_tax) docs.push({ key: 'sellers_permit', label: "Seller's Permit" })

  return dedupe(docs)
}

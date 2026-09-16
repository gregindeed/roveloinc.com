import 'server-only'
import { overseerModel } from '@/lib/ai'

// The Overseer reading a property document (lease, ID, application, inspection,
// county record, utility bill, receipt…) and pulling out the facts it can see.
// Mirrors parseDocument() in lib/ai.ts — hands Anthropic a short-lived signed URL
// and forces a tool call so the result is a validated object, never free text.

export type PropertyFacts = {
  summary: string | null
  doc_kind: string | null
  // Property / unit facts (safe to apply into empty fields).
  sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
  year_built: number | null
  lot_size: string | null
  parcel_number: string | null
  property_type: string | null
  est_value: number | null
  purchase_price: number | null
  // Lease facts (surfaced for reference; not auto-applied).
  monthly_rent: number | null
  deposit: number | null
  lease_start: string | null
  lease_end: string | null
  tenant_name: string | null
  // Expense facts — set when the document is a bill / receipt / invoice for a
  // property operating expense, so it can be booked to the P&L.
  is_expense: boolean | null
  expense_category: string | null
  expense_vendor: string | null
  expense_amount: number | null
  expense_date: string | null
  fields: Record<string, unknown>
}

const PROPERTY_SYSTEM = `You are "the Overseer", reading a single real-estate document for a property manager. First CLASSIFY the document (doc_kind), then extract only the facts actually present. Do not guess — leave a field null if the document doesn't state it.

Classification (doc_kind), pick the best single fit:
- "lease_agreement" — a rental/lease contract
- "bill" — a bill or statement the OWNER owes: utilities (water, gas, electric/power, internet, trash), HOA, insurance premium, property tax, repair/maintenance invoice, management fee
- "receipt" — proof a payment was made
- "invoice" — an invoice billed TO a tenant
- "insurance" — an insurance policy/declaration
- "tax" — a county/tax assessment or property tax record
- "inspection" — an inspection report
- "id" — a government ID / driver's license
- "application" — a rental application
- "statement" — an account statement
- "other" — anything else

Facts: square footage, bedrooms, bathrooms describe the rentable unit; lot size, parcel/APN, year built describe the property. est_value is current estimated/appraised/market value or "Zestimate"; purchase_price is a stated sale price.

Expenses: if the document is a bill/receipt/invoice representing a PROPERTY OPERATING EXPENSE the owner pays, set is_expense=true and fill expense_category (one of: water, gas, electric, internet, trash, utilities, repairs, maintenance, insurance, property_tax, hoa, management, mortgage_interest, landscaping, pest, cleaning, supplies, legal, other), expense_vendor (who is billing), expense_amount (the total/amount due as a plain number), and expense_date (the bill/service/paid date, ISO YYYY-MM-DD). A lease, ID, or listing is NOT an expense.

Dates in ISO (YYYY-MM-DD). Money as plain numbers (no $ or commas).`

const PROPERTY_TOOL = {
  name: 'record_property_facts',
  description: 'Classify one property document and record the facts read from it.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: ['string', 'null'], description: 'One line: what this document is.' },
      doc_kind: {
        type: ['string', 'null'],
        description: 'One of: lease_agreement, bill, receipt, invoice, insurance, tax, inspection, id, application, statement, other.',
      },
      sqft: { type: ['number', 'null'] },
      bedrooms: { type: ['number', 'null'] },
      bathrooms: { type: ['number', 'null'] },
      year_built: { type: ['integer', 'null'] },
      lot_size: { type: ['string', 'null'], description: 'e.g. "0.25 acres" or "7,200 sqft"' },
      parcel_number: { type: ['string', 'null'], description: 'County APN' },
      property_type: { type: ['string', 'null'], description: 'residential | commercial | mixed | land' },
      est_value: { type: ['number', 'null'], description: 'Estimated / appraised / market value or Zestimate' },
      purchase_price: { type: ['number', 'null'], description: 'Stated sale or purchase price' },
      monthly_rent: { type: ['number', 'null'] },
      deposit: { type: ['number', 'null'] },
      lease_start: { type: ['string', 'null'] },
      lease_end: { type: ['string', 'null'] },
      tenant_name: { type: ['string', 'null'] },
      is_expense: { type: ['boolean', 'null'], description: 'True if this is a bill/receipt/invoice for a property operating expense the owner pays.' },
      expense_category: { type: ['string', 'null'], description: 'water, gas, electric, internet, trash, utilities, repairs, maintenance, insurance, property_tax, hoa, management, mortgage_interest, landscaping, pest, cleaning, supplies, legal, other' },
      expense_vendor: { type: ['string', 'null'], description: 'Who issued the bill (utility company, contractor, etc.)' },
      expense_amount: { type: ['number', 'null'], description: 'Total amount of the expense' },
      expense_date: { type: ['string', 'null'], description: 'Bill / service / paid date (ISO)' },
    },
    required: [],
  },
}

async function callExtract(content: unknown[]): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 1024,
      system: PROPERTY_SYSTEM,
      tools: [PROPERTY_TOOL],
      tool_choice: { type: 'tool', name: 'record_property_facts' },
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const blocks = (data?.content ?? []) as { type?: string; input?: unknown }[]
  const tool = blocks.find((b) => b.type === 'tool_use')
  if (tool && tool.input && typeof tool.input === 'object') return tool.input as Record<string, unknown>
  return {}
}

const asNum = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}
const asStr = (v: unknown): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
const asBool = (v: unknown): boolean | null => {
  if (v == null) return null
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase().trim()
  if (s === 'true' || s === 'yes') return true
  if (s === 'false' || s === 'no') return false
  return null
}

function normalize(raw: Record<string, unknown>): PropertyFacts {
  return {
    summary: asStr(raw.summary),
    doc_kind: asStr(raw.doc_kind),
    sqft: asNum(raw.sqft),
    bedrooms: asNum(raw.bedrooms),
    bathrooms: asNum(raw.bathrooms),
    year_built: asNum(raw.year_built),
    lot_size: asStr(raw.lot_size),
    parcel_number: asStr(raw.parcel_number),
    property_type: asStr(raw.property_type),
    est_value: asNum(raw.est_value),
    purchase_price: asNum(raw.purchase_price),
    monthly_rent: asNum(raw.monthly_rent),
    deposit: asNum(raw.deposit),
    lease_start: asStr(raw.lease_start),
    lease_end: asStr(raw.lease_end),
    tenant_name: asStr(raw.tenant_name),
    is_expense: asBool(raw.is_expense),
    expense_category: asStr(raw.expense_category),
    expense_vendor: asStr(raw.expense_vendor),
    expense_amount: asNum(raw.expense_amount),
    expense_date: asStr(raw.expense_date),
    fields: raw,
  }
}

// Parse a PDF/image property document by short-lived signed URL.
export async function parsePropertyDoc(opts: { mediaType: string; url: string }): Promise<PropertyFacts> {
  const isPdf = opts.mediaType === 'application/pdf'
  const isImg = opts.mediaType.startsWith('image/')
  if (!isPdf && !isImg) throw new Error(`Unsupported file type for AI parsing: ${opts.mediaType || 'unknown'}`)
  const source = { type: 'url', url: opts.url }
  const fileBlock = isPdf ? { type: 'document', source } : { type: 'image', source }
  const raw = await callExtract([
    fileBlock,
    { type: 'text', text: 'Classify this document and extract property, unit, lease, and any expense facts per the schema. Only include values you can actually read.' },
  ])
  return normalize(raw)
}

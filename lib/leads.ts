// Leads — a lightweight sales pipeline of prospective accounts. Shared types
// and labels for the leads module. Pure (no server-only) so both server and
// client components can import them.

export type LeadKind = 'business' | 'individual'

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'won' | 'lost'

// Ordered as the pipeline flows; used for the stage picker and grouping.
export const LEAD_STAGES: LeadStage[] = ['new', 'contacted', 'qualified', 'won', 'lost']

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
}

// Tailwind classes for each stage chip (kept here so server + client agree).
export const LEAD_STAGE_STYLE: Record<LeadStage, string> = {
  new: 'bg-gray-100 text-gray-600 border-gray-200',
  contacted: 'bg-blue-50 text-blue-700 border-blue-100',
  qualified: 'bg-violet-50 text-violet-700 border-violet-100',
  won: 'bg-green-50 text-green-700 border-green-100',
  lost: 'bg-gray-50 text-gray-400 border-gray-200',
}

export type Lead = {
  id: string
  org_id: string | null
  kind: LeadKind
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  tax_id: string | null
  address: string | null
  stage: LeadStage
  source: string | null
  notes: string | null
  assigned_to: string | null
  converted_client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function normalizeLeadKind(v: unknown): LeadKind {
  return String(v ?? '').toLowerCase() === 'individual' ? 'individual' : 'business'
}

export function normalizeLeadStage(v: unknown): LeadStage {
  const s = String(v ?? '').toLowerCase()
  return (LEAD_STAGES as string[]).includes(s) ? (s as LeadStage) : 'new'
}

import 'server-only'

// Cheap + fast by default. Override with ANTHROPIC_MODEL (e.g. a Sonnet id) any time.
const DEFAULT_MODEL = 'claude-haiku-4-5'

const SYSTEM = `You are "the Overseer" — a sharp, candid compliance and bookkeeping advisor for a California business-services firm (Rovelo Inc). You are given a JSON snapshot of one client entity's data and asked for a brief assessment for a given tab/scope.

Tell the bookkeeper, in first person, what looks good, what is behind or at risk, and — critically — what data is MISSING that you need to do your job. Be specific and cite the actual numbers, dates, and gaps from the snapshot. If key facts are absent (entity type, EIN, agency accounts, officers/ownership, etc.), explicitly ask for them and say why they matter. Flag compliance risks plainly (overdue filings, unpaid obligations, personal charges needing reclassification).

Rules:
- 2 to 4 short sentences. Plain language. No preamble, no headings, no bullet lists.
- Never invent data. If the snapshot lacks something, say you lack it and ask for it.
- Be constructive but honest — you are a critical helping hand, not a cheerleader.
- End with the single most important next action, if there is a clear one.
- If the snapshot includes an "operator_briefing", that is context the bookkeeper has written for you directly about how this entity actually operates. Treat it as authoritative ground truth: use it to interpret the data, and do NOT flag as problems the things it explains as intentional or expected (for example, a sole proprietor with no Articles, no EIN, or no formation documents by design, filing on Schedule C). Still surface genuine risks and gaps the briefing does not account for.
- The snapshot may include "standing_facts" (durable, acknowledged truths about this entity from its System Registry — e.g. a prior-year penalty, a planned expansion, a known exemption) and "recent_history" (a dated log of what has happened and what you have already learned about this entity). Treat standing_facts as authoritative history and factor them into your read; use recent_history to stay consistent with what has already been established and to avoid re-flagging things already handled.`

export function overseerModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

export async function assess(scope: string, context: unknown): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Scope: ${scope}\n\nEntity data snapshot (JSON):\n${JSON.stringify(context, null, 2)}\n\nGive your assessment for this scope.`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = (data?.content ?? [])
    .filter((b: { type?: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n')
    .trim()
  return text || 'No assessment returned.'
}

// ---------------------------------------------------------------------------
// Onboarding brief — the Overseer's opening read of a newly onboarded business.
// One cheap, one-shot synthesis of the interview facts into (1) a natural read
// of what the business is and (2) how it will be handled. Grounded on the
// deterministically-derived compliance profile passed in the context.
// ---------------------------------------------------------------------------

export type OnboardingBrief = { read: string; handling: string }

const ONBOARD_SYSTEM = `You are "the Overseer" — the compliance and bookkeeping mind for Rovelo Inc, a California business-services firm. A new business has just been onboarded through a short guided interview. You are handed the facts it gave, plus "system_auto_schedule" (the filings our built-in templates will auto-create for it) and "home_state".

Write two things, in first person, warm but precise:
1) "read" — a natural 2-4 sentence portrait of this business: what it is / does, where and (if given) since when, its entity type and who owns it. If an "entity_subtype" is given (e.g. "Limited Partnership (LP)"), use that specific label rather than the generic type. Weave the facts into real prose, like you understand the business — not a list. Use the owners' names and the activity. Only state facts you were given; never invent dates, EINs, or numbers.
2) "handling" — 1-3 sentences on how you'll keep its books and stay ahead of its filings, naming the accounting basis and the CORRECT compliance obligations for THIS entity's home state and type. This is your plan for this specific entity.

CRITICAL — state correctness:
- The business's home_state governs its state filings. Name the obligations that actually apply THERE, using your own knowledge — do not just repeat "system_auto_schedule" if the entity is out of state.
- Our built-in auto-schedule templates cover California state agencies (FTB, CDTFA, EDD, CA SOS) and federal IRS filings only. "system_auto_schedule" reflects what will be auto-created.
- If "is_california" is false, DO NOT attribute any California agency (FTB, CDTFA, EDD, California Secretary of State) to this entity. Instead name the real home-state equivalents — e.g. for Texas: the Texas Comptroller franchise tax and Public Information Report, and Texas Secretary of State; for Nevada: the Nevada SOS annual list and state business license — and note that its state schedule will be set up for that state (our auto-templates are California-only), while federal filings (e.g. IRS 941/940 for payroll) still apply everywhere.
- If you are not certain of a specific out-of-state form name, refer to it by function ("the state's annual report / franchise tax") rather than guessing a California one.

No headings, no bullet lists, no preamble. If a fact is missing, simply don't mention it — do not point out its absence here (this is a welcome, not an audit).`

const ONBOARD_TOOL = {
  name: 'record_onboarding_brief',
  description: "Record the Overseer's opening read and handling plan for a newly onboarded business.",
  input_schema: {
    type: 'object',
    properties: {
      read: { type: 'string', description: 'A 2-4 sentence first-person portrait of the business.' },
      handling: { type: 'string', description: "1-3 sentences on how you'll handle its books and filings." },
    },
    required: ['read', 'handling'],
  },
}

// When the operator's language is Spanish, the Overseer writes its prose in
// Spanish. The structured facts/enum values it returns stay as-is.
function localeInstruction(locale?: string): string {
  return locale === 'es'
    ? '\n\nIMPORTANT: Write all prose you return (read, handling, acknowledgment) in natural, fluent Spanish (español). Keep proper nouns and agency/form names as-is.'
    : ''
}

export async function onboardingBrief(context: unknown, locale?: string): Promise<OnboardingBrief> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 500,
      system: ONBOARD_SYSTEM + localeInstruction(locale),
      tools: [ONBOARD_TOOL],
      tool_choice: { type: 'tool', name: 'record_onboarding_brief' },
      messages: [
        {
          role: 'user',
          content: `A new business just finished onboarding. Here is what it told us and the compliance profile it implies (JSON):\n${JSON.stringify(context, null, 2)}\n\nRecord your opening read and handling plan.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const blocks = (data?.content ?? []) as { type?: string; input?: unknown }[]
  const tool = blocks.find((b) => b.type === 'tool_use')
  const input = (tool?.input ?? {}) as Record<string, unknown>
  const read = typeof input.read === 'string' ? input.read.trim() : ''
  const handling = typeof input.handling === 'string' ? input.handling.trim() : ''
  if (!read && !handling) throw new Error('No brief returned.')
  return { read, handling }
}

// ---------------------------------------------------------------------------
// Onboarding revision — the operator replies to the Overseer's read on the
// review step ("actually it's an S-corp in Texas"). The Overseer acknowledges,
// corrects any facts it got wrong, and rewrites its read/handling.
// ---------------------------------------------------------------------------

export type OnboardingRevision = {
  acknowledgment: string
  read: string
  handling: string
  updates: {
    entity_type?: string
    state?: string
    formation_date?: string
    business_activity?: string
    has_employees?: string
    accounting_basis?: string
    accounting_system?: string
    owners?: { name: string; pct: number | null }[]
  }
}

const REVISE_SYSTEM = `You are "the Overseer" for Rovelo Inc, a California business-services firm. During onboarding you gave a new business a short read (portrait + handling plan). The operator is now replying to correct or adjust it. Take their message as ground truth and update accordingly.

Do three things via the tool:
1) "acknowledgment" — one short, warm sentence confirming what you changed (e.g. "Got it — updated the home state to Texas and re-based the filings.").
2) "updates" — ONLY the facts the operator's message actually changes, using the exact fields provided. Leave out anything they didn't touch. Normalize: entity_type is one of sole_prop/partnership/llc/s_corp/c_corp/nonprofit/other; state is a 2-letter US code; formation_date is YYYY-MM-DD; has_employees is yes/no/not_yet/not_sure; accounting_basis is cash/accrual. owners is the full corrected list of {name, pct}.
3) "read" and "handling" — rewrite BOTH to reflect the corrected facts, same rules as the original: warm first-person, correct home-state compliance (never attribute California agencies to an out-of-state entity — name the real state's filings from your knowledge), no headings or lists.

Never invent facts the operator didn't give. If their message is just a question or approval with no change, return empty updates and keep the read/handling consistent with the existing facts.`

const REVISE_TOOL = {
  name: 'revise_onboarding',
  description: "Acknowledge the operator's correction, update facts, and rewrite the read.",
  input_schema: {
    type: 'object',
    properties: {
      acknowledgment: { type: 'string' },
      read: { type: 'string' },
      handling: { type: 'string' },
      updates: {
        type: 'object',
        properties: {
          entity_type: { type: 'string' },
          state: { type: 'string' },
          formation_date: { type: 'string' },
          business_activity: { type: 'string' },
          has_employees: { type: 'string' },
          accounting_basis: { type: 'string' },
          accounting_system: { type: 'string' },
          owners: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, pct: { type: ['number', 'null'] } },
              required: ['name'],
            },
          },
        },
      },
    },
    required: ['acknowledgment', 'read', 'handling', 'updates'],
  },
}

export async function reviseOnboarding(context: unknown, message: string, locale?: string): Promise<OnboardingRevision> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 700,
      system: REVISE_SYSTEM + localeInstruction(locale),
      tools: [REVISE_TOOL],
      tool_choice: { type: 'tool', name: 'revise_onboarding' },
      messages: [
        {
          role: 'user',
          content: `Current facts and profile (JSON):\n${JSON.stringify(context, null, 2)}\n\nThe operator replied:\n"${message}"\n\nAcknowledge, update any facts they changed, and rewrite your read and handling.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const blocks = (data?.content ?? []) as { type?: string; input?: unknown }[]
  const tool = blocks.find((b) => b.type === 'tool_use')
  const input = (tool?.input ?? {}) as Partial<OnboardingRevision>
  return {
    acknowledgment: typeof input.acknowledgment === 'string' ? input.acknowledgment.trim() : '',
    read: typeof input.read === 'string' ? input.read.trim() : '',
    handling: typeof input.handling === 'string' ? input.handling.trim() : '',
    updates: (input.updates && typeof input.updates === 'object' ? input.updates : {}) as OnboardingRevision['updates'],
  }
}

// ---------------------------------------------------------------------------
// Compliance drafting — for a state we don't have built-in templates for, the
// Overseer proposes the filing calendar. Output is UNVERIFIED until a human
// confirms it; it never drives a reminder on its own.
// ---------------------------------------------------------------------------

export type DraftedObligation = {
  agency_label: string
  kind: string
  label: string
  frequency: 'monthly' | 'quarterly' | 'annual' | 'biennial' | 'one_time'
  events: { period_label: string; due_date: string }[]
}
export type ComplianceDraft = { obligations: DraftedObligation[]; note: string }

const DRAFT_SYSTEM = `You are "the Overseer", the compliance mind for Rovelo Inc. Our built-in schedule templates cover California and federal filings only. You are given a business in ANOTHER US state and asked to DRAFT its state + local filing calendar for a human to review.

Using your own knowledge of that state's requirements, propose the obligations this specific entity most likely owes at the STATE and LOCAL level for the given calendar year — e.g. the state's franchise/privilege tax, annual report / periodic report, sales/transaction tax registration, state payroll/withholding and unemployment if it has employees, and any obvious local/city license. Do NOT include federal IRS filings (those are handled separately) and do NOT include California agencies.

For each obligation give the real agency name, a short stable "kind" slug (lowercase, e.g. "az_tpt", "tx_franchise", "az_annual_report"), a human label, a frequency, and the concrete due dates (YYYY-MM-DD) for the given year using that state's standard statutory deadlines. If a specific deadline is uncertain, use the state's standard due date rather than omitting it, and keep the label general. Keep it to the handful that clearly apply (max 6). Also return a one-sentence "note" summarizing what the operator should verify.

These are DRAFTS for human confirmation — be accurate and conservative, never invent account numbers or amounts.`

const DRAFT_TOOL = {
  name: 'record_compliance_draft',
  description: "Record the Overseer's proposed state filing calendar for review.",
  input_schema: {
    type: 'object',
    properties: {
      note: { type: 'string' },
      obligations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agency_label: { type: 'string' },
            kind: { type: 'string' },
            label: { type: 'string' },
            frequency: { type: 'string', enum: ['monthly', 'quarterly', 'annual', 'biennial', 'one_time'] },
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: { period_label: { type: 'string' }, due_date: { type: 'string' } },
                required: ['period_label', 'due_date'],
              },
            },
          },
          required: ['agency_label', 'kind', 'label', 'frequency', 'events'],
        },
      },
    },
    required: ['obligations', 'note'],
  },
}

const FREQS = new Set(['monthly', 'quarterly', 'annual', 'biennial', 'one_time'])

export async function draftStateCompliance(context: unknown, locale?: string): Promise<ComplianceDraft> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 1500,
      system: DRAFT_SYSTEM + localeInstruction(locale),
      tools: [DRAFT_TOOL],
      tool_choice: { type: 'tool', name: 'record_compliance_draft' },
      messages: [
        {
          role: 'user',
          content: `Draft the state + local filing calendar (JSON context):\n${JSON.stringify(context, null, 2)}\n\nRecord the proposed obligations.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const blocks = (data?.content ?? []) as { type?: string; input?: unknown }[]
  const tool = blocks.find((b) => b.type === 'tool_use')
  const input = (tool?.input ?? {}) as { obligations?: unknown; note?: unknown }

  const dateOk = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const obligations: DraftedObligation[] = Array.isArray(input.obligations)
    ? input.obligations
        .map((o): DraftedObligation | null => {
          if (!o || typeof o !== 'object') return null
          const r = o as Record<string, unknown>
          const freq = typeof r.frequency === 'string' && FREQS.has(r.frequency) ? r.frequency : 'annual'
          const events = Array.isArray(r.events)
            ? r.events
                .filter((e) => e && typeof e === 'object' && dateOk((e as Record<string, unknown>).due_date))
                .map((e) => {
                  const er = e as Record<string, unknown>
                  return { period_label: String(er.period_label ?? '').slice(0, 120), due_date: er.due_date as string }
                })
            : []
          if (typeof r.label !== 'string' || !r.label.trim() || events.length === 0) return null
          return {
            agency_label: typeof r.agency_label === 'string' ? r.agency_label.slice(0, 120) : 'State agency',
            kind: (typeof r.kind === 'string' ? r.kind : 'state_filing').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40),
            label: r.label.slice(0, 160),
            frequency: freq as DraftedObligation['frequency'],
            events,
          }
        })
        .filter((o): o is DraftedObligation => !!o)
        .slice(0, 6)
    : []

  return { obligations, note: typeof input.note === 'string' ? input.note.trim() : '' }
}

// ---------------------------------------------------------------------------
// Document intake parser — reads a PDF/image and extracts structured data.
// ---------------------------------------------------------------------------

export type ParsedDoc = {
  document_type: string | null
  agency: string | null
  title: string | null
  summary: string | null
  tags: string[]
  issue_date: string | null
  expires_date: string | null
  entity_fields: Record<string, string>
  // Per-field confidence 0..1 for each extracted entity field (trust layer).
  field_confidence: Record<string, number>
  // Where this document should be filed in Documents & Sources.
  folder_category: string | null
  period_year: number | null
  period_month: number | null
}

const EXTRACT_SYSTEM = `You are a document-intake parser for a California business-services firm. You receive ONE scanned or digital document belonging to a single business entity, and you extract structured data from it.

Return ONLY a single JSON object (no prose, no markdown fences) with exactly these keys:
{
  "document_type": one of ["business_license","sellers_permit","articles","ein_letter","statement_of_information","insurance","lease","bank_statement","tax_return","agency_notice","receipt","other"],
  "agency": one of ["cdtfa","ftb","edd","irs","sos","city","county","other"] or null,
  "title": a short human label for this document (e.g. "CDTFA Seller's Permit"),
  "summary": one or two plain sentences describing what this document is and its key content,
  "tags": array of short lowercase keyword tags,
  "issue_date": "YYYY-MM-DD" or null,
  "expires_date": "YYYY-MM-DD" or null,
  "entity_fields": {
    "legal_name": string, "entity_type": one of ["sole_prop","partnership","llc","s_corp","c_corp","nonprofit","other"],
    "ein": string, "ca_sos_number": string, "cdtfa_account": string, "edd_account": string,
    "ftb_id": string, "formation_date": "YYYY-MM-DD", "naics_code": string, "address": string
  },
  "field_confidence": { for EACH key you put in entity_fields, a number 0.0-1.0 for how sure you are you read it correctly },
  "folder_category": one of ["bank_statements","credit_card","income","expenses","payroll","other","permanent","agency_notices"],
  "period_year": integer year the document COVERS, or null,
  "period_month": integer 1-12 month the document COVERS, or null
}

Filing rules (folder_category — where this document should be filed):
- "permanent" = foundational entity records that don't belong to a month: Articles of Incorporation/Organization, EIN letter (CP-575), Statement of Information, Seller's Permit, business license, operating agreement, bylaws.
- "agency_notices" = a letter, notice, or correspondence FROM a tax agency (CDTFA, FTB, EDD, IRS, CA SOS).
- "bank_statements" = a bank account statement. "credit_card" = a credit-card statement.
- "income" = money IN: sales invoices you issued, deposit records. "expenses" = money OUT: vendor bills, receipts, purchases. "payroll" = paystubs and payroll registers.
- "other" = anything that doesn't fit the above.

Period rules:
- period_year / period_month are the period the document COVERS, not today's date. A July 2026 bank statement is period_year 2026, period_month 7.
- For "permanent" and "agency_notices", set period_year and period_month to null.
- If the covered month is unclear (a document spanning a quarter or full year), set period_month to null but still give period_year if known.

Rules:
- In entity_fields, include ONLY keys whose values you can actually read on the document. Omit everything else. Never guess or fabricate an EIN, account number, or date.
- Numbers must be transcribed exactly as printed (keep hyphens).
- If you are unsure of the document_type, use "other". Output valid JSON and nothing else.`

function extractJson(text: string): Record<string, unknown> {
  let t = text.trim()
  // strip code fences if present
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t)
}

const DOC_TYPES = new Set([
  'business_license', 'sellers_permit', 'articles', 'ein_letter', 'statement_of_information',
  'insurance', 'lease', 'bank_statement', 'tax_return', 'agency_notice', 'receipt', 'other',
])
const AGENCIES = new Set(['cdtfa', 'ftb', 'edd', 'irs', 'sos', 'city', 'county', 'other'])
const ENTITY_TYPES = new Set(['sole_prop', 'partnership', 'llc', 's_corp', 'c_corp', 'nonprofit', 'other'])
const FIELD_KEYS = [
  'legal_name', 'entity_type', 'ein', 'ca_sos_number', 'cdtfa_account',
  'edd_account', 'ftb_id', 'formation_date', 'naics_code', 'address',
]

// Schema-validated extraction via tool-calling. Forcing a tool call makes the
// model return a structured object we don't have to strip fences off or regex —
// and gives us a natural home for per-field confidence.
const EXTRACT_TOOL = {
  name: 'record_document',
  description: 'Record the structured extraction of one business document.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: { type: ['string', 'null'] },
      agency: { type: ['string', 'null'] },
      title: { type: ['string', 'null'] },
      summary: { type: ['string', 'null'] },
      tags: { type: 'array', items: { type: 'string' } },
      issue_date: { type: ['string', 'null'] },
      expires_date: { type: ['string', 'null'] },
      entity_fields: { type: 'object', description: 'Only keys you can actually read on the document.' },
      field_confidence: { type: 'object', description: 'Same keys as entity_fields, each a number 0-1.' },
      folder_category: { type: ['string', 'null'] },
      period_year: { type: ['integer', 'null'] },
      period_month: { type: ['integer', 'null'] },
    },
    required: ['entity_fields'],
  },
}

async function callExtract(content: unknown[]): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 1024,
      system: EXTRACT_SYSTEM,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'record_document' },
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const blocks = (data?.content ?? []) as { type?: string; input?: unknown; text?: string }[]
  // Preferred: the forced tool call returns a validated object directly.
  const tool = blocks.find((b) => b.type === 'tool_use')
  if (tool && tool.input && typeof tool.input === 'object') return tool.input as Record<string, unknown>
  // Fallback: some responses still come back as text JSON — parse defensively.
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
  return extractJson(text)
}

// Read a document from an already-extracted plain-text representation
// (spreadsheets converted to CSV, CSV/TXT files, etc.).
export async function parseDocumentText(text: string): Promise<ParsedDoc> {
  const raw = await callExtract([
    {
      type: 'text',
      text: `The following is the extracted text/data of one document. Classify and file it per the schema.\n\n${text.slice(0, 24000)}`,
    },
  ])
  return normalizeParsed(raw)
}

// Parse a PDF/image by URL. We hand Anthropic a short-lived signed URL and let
// it fetch the file directly, so the Worker never has to load the bytes into
// memory or base64-encode them (which was blowing past the 128MB Worker limit).
export async function parseDocument(opts: { mediaType: string; url: string }): Promise<ParsedDoc> {
  const isPdf = opts.mediaType === 'application/pdf'
  const isImg = opts.mediaType.startsWith('image/')
  if (!isPdf && !isImg) {
    throw new Error(`Unsupported file type for AI parsing: ${opts.mediaType || 'unknown'}`)
  }
  const source = { type: 'url', url: opts.url }
  const fileBlock = isPdf ? { type: 'document', source } : { type: 'image', source }
  const raw = await callExtract([fileBlock, { type: 'text', text: 'Extract this document as JSON per the schema.' }])
  return normalizeParsed(raw)
}

// ---------------------------------------------------------------------------
// Transaction categorizer — maps bank/card transactions to chart accounts.
// ---------------------------------------------------------------------------

export type CategorizeAccount = { code: string; name: string; type: string }
export type CategorizeTxn = {
  id: string
  date: string
  description: string
  amount: number
  memo?: string | null
  personal?: boolean
}

// Returns { [txnId]: accountCode } for the transactions the model could place.
export async function categorizeTransactions(
  kind: 'income' | 'expense',
  accounts: CategorizeAccount[],
  txns: CategorizeTxn[],
  briefing?: string | null
): Promise<Record<string, string>> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  if (txns.length === 0) return {}

  const chart = accounts.map((a) => `${a.code} | ${a.type} | ${a.name}`).join('\n')
  const list = txns
    .map((t) =>
      JSON.stringify({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        memo: t.memo ?? undefined,
        personal: t.personal || undefined,
      })
    )
    .join('\n')

  const system = `You are a bookkeeping categorizer for a California business. You map each ${kind} transaction to exactly ONE account from the entity's chart of accounts, using the account CODE.

Chart of accounts (code | type | name):
${chart}

Rules:
- Return the single best-fit account CODE for every transaction id.
- ${kind === 'income' ? 'These are money-IN transactions — prefer income accounts.' : 'These are money-OUT transactions — prefer expense or COGS accounts.'}
- A transaction flagged "personal": true is a personal charge on a business account — map it to the Owner's Draw / Distributions equity account (it is NOT a business expense).
- Card/loan PAYMENTS or transfers between the business's own accounts are not expenses — map them to the Credit Card Payable or bank/liability account if one fits.
- If nothing fits well, choose the closest "Other" account of the correct class rather than guessing a specific one.
- Use the operator briefing (if given) to interpret ambiguous descriptions.
${briefing ? `\nOperator briefing about how this business operates:\n${briefing}\n` : ''}
Return ONLY a JSON object mapping each transaction id (as a string key) to an account code string. No prose, no markdown. Example: {"12":"6010","13":"5010"}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: Math.min(4096, 40 + txns.length * 24),
      system,
      messages: [{ role: 'user', content: `Categorize these transactions:\n${list}` }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = (data?.content ?? [])
    .filter((b: { type?: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n')

  const valid = new Set(accounts.map((a) => a.code))
  const out: Record<string, string> = {}
  try {
    const raw = extractJson(text) as Record<string, unknown>
    for (const [id, code] of Object.entries(raw)) {
      if (typeof code === 'string' && valid.has(code)) out[id] = code
    }
  } catch {
    // model returned unparseable output — leave everything uncategorized
  }
  return out
}

// ---------------------------------------------------------------------------
// Statement parser — extracts line items + balances from a bank/card statement.
// ---------------------------------------------------------------------------

export type StatementTxn = {
  date: string
  description: string
  amount: number
  direction: 'in' | 'out'
  check_num?: string | null
}
export type ParsedStatement = {
  statement_type: 'bank' | 'card' | 'unknown'
  period_start: string | null
  period_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  transactions: StatementTxn[]
}

const STATEMENT_SYSTEM = `You extract structured data from ONE bank or credit-card statement for bookkeeping.

Return ONLY a single JSON object (no prose, no markdown fences) with exactly these keys:
{
  "statement_type": "bank" | "card",
  "period_start": "YYYY-MM-DD" or null,
  "period_end": "YYYY-MM-DD" or null,
  "opening_balance": number or null,
  "closing_balance": number or null,
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "string", "amount": positive number, "direction": "in" | "out", "check_num": "string or null" }
  ]
}

Rules:
- "statement_type": "bank" for a checking/savings/bank statement; "card" for a credit-card statement.
- Every transaction "amount" must be a POSITIVE number. Use "direction" to indicate flow:
  - "in"  = money into the account: deposits, credits, incoming transfers, refunds; on a CARD, a payment received or a returned charge.
  - "out" = money out: withdrawals, debits, checks, fees; on a CARD, a purchase/charge.
- Include a "check_num" only when a check number is printed for that line, else null.
- opening_balance = beginning/previous balance; closing_balance = ending/new balance for the statement period.
- Transcribe every posted transaction you can read. Do NOT include running-balance columns as transactions.
- Dates must be YYYY-MM-DD. If the year is only implied, infer it from the statement period.
- Output valid JSON and nothing else.`

function normalizeStatement(raw: Record<string, unknown>): ParsedStatement {
  const asNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[$,]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const asDate = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null

  const st = raw.statement_type === 'bank' || raw.statement_type === 'card' ? raw.statement_type : 'unknown'
  const rawTxns = Array.isArray(raw.transactions) ? raw.transactions : []
  const transactions: StatementTxn[] = []
  for (const t of rawTxns) {
    if (!t || typeof t !== 'object') continue
    const o = t as Record<string, unknown>
    const date = asDate(o.date)
    const amount = asNum(o.amount)
    if (!date || amount == null) continue
    transactions.push({
      date,
      description: typeof o.description === 'string' ? o.description.slice(0, 300) : '',
      amount: Math.abs(amount),
      direction: o.direction === 'in' ? 'in' : 'out',
      check_num: typeof o.check_num === 'string' && o.check_num.trim() ? o.check_num.trim() : null,
    })
  }

  return {
    statement_type: st,
    period_start: asDate(raw.period_start),
    period_end: asDate(raw.period_end),
    opening_balance: asNum(raw.opening_balance),
    closing_balance: asNum(raw.closing_balance),
    transactions,
  }
}

async function callStatement(content: unknown[]): Promise<ParsedStatement> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: overseerModel(),
      max_tokens: 8000,
      system: STATEMENT_SYSTEM,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = (data?.content ?? [])
    .filter((b: { type?: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n')
  return normalizeStatement(extractJson(text))
}

export async function parseStatementDoc(opts: { mediaType: string; url: string }): Promise<ParsedStatement> {
  const isPdf = opts.mediaType === 'application/pdf'
  const isImg = opts.mediaType.startsWith('image/')
  if (!isPdf && !isImg) throw new Error(`Unsupported statement file type: ${opts.mediaType || 'unknown'}`)
  const source = { type: 'url', url: opts.url }
  const fileBlock = isPdf ? { type: 'document', source } : { type: 'image', source }
  return callStatement([fileBlock, { type: 'text', text: 'Extract this statement as JSON per the schema.' }])
}

export async function parseStatementText(text: string): Promise<ParsedStatement> {
  return callStatement([
    { type: 'text', text: `The following is the extracted text/rows of one statement. Extract per the schema.\n\n${text.slice(0, 60000)}` },
  ])
}

function normalizeParsed(raw: Record<string, unknown>): ParsedDoc {
  const dt = typeof raw.document_type === 'string' && DOC_TYPES.has(raw.document_type) ? raw.document_type : 'other'
  const ag = typeof raw.agency === 'string' && AGENCIES.has(raw.agency) ? raw.agency : null
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string').slice(0, 12) : []

  const rawFields = (raw.entity_fields && typeof raw.entity_fields === 'object' ? raw.entity_fields : {}) as Record<
    string,
    unknown
  >
  const rawConf = (raw.field_confidence && typeof raw.field_confidence === 'object' ? raw.field_confidence : {}) as Record<
    string,
    unknown
  >
  const entity_fields: Record<string, string> = {}
  const field_confidence: Record<string, number> = {}
  for (const k of FIELD_KEYS) {
    const v = rawFields[k]
    if (typeof v === 'string' && v.trim()) {
      if (k === 'entity_type' && !ENTITY_TYPES.has(v.trim())) continue
      entity_fields[k] = v.trim()
      const c = rawConf[k]
      const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : NaN
      field_confidence[k] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.6
    }
  }

  const asDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

  const ROUTE_CATEGORIES = new Set([
    'bank_statements', 'credit_card', 'income', 'expenses', 'payroll', 'other', 'permanent', 'agency_notices',
  ])
  const fc =
    typeof raw.folder_category === 'string' && ROUTE_CATEGORIES.has(raw.folder_category) ? raw.folder_category : null

  const asYear = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : NaN
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
  }
  const asMonth = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,2}$/.test(v) ? Number(v) : NaN
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
  }

  return {
    document_type: dt,
    agency: ag,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 140) : null,
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 500) : null,
    tags: tags as string[],
    issue_date: asDate(raw.issue_date),
    expires_date: asDate(raw.expires_date),
    entity_fields,
    field_confidence,
    folder_category: fc,
    period_year: asYear(raw.period_year),
    period_month: asMonth(raw.period_month),
  }
}

// ── Attention / brief engine (pure, token-free) ──────────────────────────────
// Turns the persisted Entity State into a short list of what needs attention for
// one entity — overdue filings, missing statements, low readiness, and pending
// human reviews. No LLM: it reads the structured state we already computed and
// narrates it with deterministic wording. This is the data behind the in-app
// "Needs attention" digest and the emailed morning brief.

// Shape of the jsonb columns persisted on entity_state (see lib/entityState.ts).
export type StateRow = {
  client_id: string
  overall: number
  financial?: { monthsCovered?: number; monthsExpected?: number; gaps?: string[] } | null
  compliance?: { overdue?: number; dueSoon?: number; known?: boolean } | null
  open_actions?: { label: string; urgency: string }[] | null
  computed_at?: string | null
}

export type AttentionLevel = 'critical' | 'warning' | 'info'

export type Attention = {
  clientId: string
  name: string
  slug: string
  overall: number
  level: AttentionLevel
  reasons: string[] // short, human phrases
}

export type BriefInputs = {
  client: { id: string; name: string; slug: string }
  state: StateRow | null
  pendingReviews: number
  openProposals: number
}

// Build the attention summary for one entity. Returns null when there's nothing
// worth surfacing (so a healthy entity stays out of the digest).
export function deriveAttention(inp: BriefInputs): Attention | null {
  const { client, state } = inp
  const reasons: string[] = []
  let level: AttentionLevel = 'info'

  const overdue = state?.compliance?.overdue ?? 0
  const dueSoon = state?.compliance?.dueSoon ?? 0
  const gaps = state?.financial?.gaps ?? []
  const overall = state?.overall ?? 0

  if (overdue > 0) {
    reasons.push(`${overdue} overdue filing${overdue === 1 ? '' : 's'}`)
    level = 'critical'
  }
  if (inp.pendingReviews > 0) {
    reasons.push(`${inp.pendingReviews} field${inp.pendingReviews === 1 ? '' : 's'} awaiting review`)
    if (level !== 'critical') level = 'warning'
  }
  if (gaps.length > 0) {
    const shown = gaps.slice(0, 2).join(', ')
    reasons.push(`missing statement${gaps.length === 1 ? '' : 's'}: ${shown}${gaps.length > 2 ? ` +${gaps.length - 2}` : ''}`)
    if (level === 'info') level = 'warning'
  }
  if (dueSoon > 0) {
    reasons.push(`${dueSoon} filing${dueSoon === 1 ? '' : 's'} due soon`)
  }
  if (inp.openProposals > 0) {
    reasons.push(`${inp.openProposals} Overseer suggestion${inp.openProposals === 1 ? '' : 's'}`)
  }
  if (!state) {
    reasons.push('readiness not computed yet')
  } else if (overall < 50 && reasons.length === 0) {
    reasons.push(`low readiness (${overall}%)`)
    if (level === 'info') level = 'warning'
  }

  if (reasons.length === 0) return null
  return { clientId: client.id, name: client.name, slug: client.slug, overall, level, reasons }
}

const LEVEL_RANK: Record<AttentionLevel, number> = { critical: 0, warning: 1, info: 2 }

// Sort most-urgent first, then lowest readiness.
export function sortAttention(items: Attention[]): Attention[] {
  return items.slice().sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.overall - b.overall)
}

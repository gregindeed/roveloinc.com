import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/types'
import { computeEntityState, type EntityState } from '@/lib/entityState'

type DB = ReturnType<typeof createClient>

// Gather everything the readiness picture derives from, then compute it. Reads
// respect RLS through the passed client, so this is safe for a collaborator too.
export async function gatherAndCompute(supabase: DB, c: Client): Promise<EntityState> {
  const [{ data: officers }, { data: docs }, { data: statements }, { data: events }, { data: obligations }] =
    await Promise.all([
      supabase.from('entity_officers').select('id').eq('client_id', c.id),
      supabase.from('documents').select('doc_type, created_at').eq('client_id', c.id),
      supabase.from('statement_imports').select('period_start, period_end, reconciled').eq('client_id', c.id),
      supabase.from('obligation_events').select('period_label, due_date, status').eq('client_id', c.id),
      supabase.from('obligations').select('id').eq('client_id', c.id),
    ])

  const docRows = (docs ?? []) as { doc_type: string | null; created_at: string | null }[]
  const newestDocAt = docRows.reduce<string | null>(
    (max, d) => (d.created_at && (!max || d.created_at > max) ? d.created_at : max),
    null
  )

  return computeEntityState({
    client: c,
    officersCount: (officers ?? []).length,
    docTypesPresent: docRows.map((d) => d.doc_type).filter((t): t is string => !!t),
    newestDocAt,
    statements: (statements ?? []).map((s) => ({
      period_start: s.period_start as string | null,
      period_end: s.period_end as string | null,
      reconciled: s.reconciled as boolean | null,
    })),
    events: (events ?? []).map((e) => ({
      period_label: e.period_label as string | null,
      due_date: e.due_date as string,
      status: e.status as string,
    })),
    obligationsCount: (obligations ?? []).length,
    todayISO: new Date().toISOString().slice(0, 10),
    computedAtISO: new Date().toISOString(),
  })
}

function stateRow(clientId: string, state: EntityState) {
  return {
    client_id: clientId,
    overall: state.overall,
    identity: state.identity,
    documents: state.documents,
    financial: state.financial,
    compliance: state.compliance,
    open_actions: state.openActions,
    last_evidence_at: state.lastEvidenceAt,
    computed_at: state.computedAt,
  }
}

// Persist an already-computed state snapshot (no recompute).
export async function persistState(supabase: DB, clientId: string, state: EntityState): Promise<void> {
  try {
    await supabase.from('entity_state').upsert(stateRow(clientId, state), { onConflict: 'client_id' })
  } catch {
    // Never let a readiness write break the caller's real work.
  }
}

// The orchestrator entry point: recompute an entity's readiness picture from
// current data and persist it. Safe to call at the end of ANY mutation — it
// swallows its own errors so it can never break an upload/commit/edit.
export async function recomputeAndPersist(supabase: DB, clientId: string): Promise<void> {
  try {
    const { data } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (!data) return
    const state = await gatherAndCompute(supabase, data as Client)
    await supabase.from('entity_state').upsert(stateRow(clientId, state), { onConflict: 'client_id' })
  } catch {
    // swallow — readiness is derived/best-effort, not part of the transaction
  }
}

// Same, addressed by slug (for callers that only hold the slug).
export async function recomputeBySlug(supabase: DB, slug: string): Promise<void> {
  try {
    const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
    if (data?.id) await recomputeAndPersist(supabase, data.id as string)
  } catch {
    // swallow
  }
}

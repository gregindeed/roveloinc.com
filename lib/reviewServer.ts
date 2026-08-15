import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import { ENTITY_APPLY_FIELDS, ENTITY_FIELD_LABELS } from '@/lib/types'
import { logEvent } from '@/lib/registryServer'

type DB = ReturnType<typeof createClient>

// A field auto-applies only when it clears ALL of these: high confidence, the
// target is empty (nothing to clobber), and it isn't a human-verified value.
// Everything else is escalated to the review queue.
const AUTO_APPLY = 0.85

export type IngestResult = { applied: number; queued: number }

// Route a document's extracted entity fields through the trust rules:
// safe → apply (with provenance), risky → queue for human review. Never
// silently overwrites a verified value or a differing existing one.
export async function ingestExtractedFields(supabase: DB, clientId: string, docId: string): Promise<IngestResult> {
  const { data: doc } = await supabase
    .from('documents')
    .select('name, ai_fields, ai_field_confidence')
    .eq('id', docId)
    .single()
  if (!doc?.ai_fields) return { applied: 0, queued: 0 }

  const fields = (doc.ai_fields ?? {}) as Record<string, string>
  const conf = (doc.ai_field_confidence ?? {}) as Record<string, number>
  const docName = (doc.name as string) ?? null

  const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!client) return { applied: 0, queued: 0 }
  const c = client as Record<string, unknown>

  const { data: metaRows } = await supabase
    .from('entity_field_meta')
    .select('field, verified')
    .eq('client_id', clientId)
  const verified = new Set((metaRows ?? []).filter((m) => m.verified).map((m) => m.field as string))

  const apply: Record<string, string> = {}
  let applied = 0
  let queued = 0

  for (const field of ENTITY_APPLY_FIELDS) {
    const proposed = String(fields[field] ?? '').trim()
    if (!proposed) continue
    const current = (c[field] == null ? '' : String(c[field])).trim()
    if (current === proposed) continue // already matches — nothing to do

    const cf = typeof conf[field] === 'number' ? conf[field] : 0.6
    const isVerified = verified.has(field)
    const conflict = current !== '' && current !== proposed
    const safe = !isVerified && !conflict && cf >= AUTO_APPLY

    if (safe) {
      apply[field] = proposed
      await supabase.from('entity_field_meta').upsert(
        { client_id: clientId, field, source_doc_id: docId, confidence: cf, verified: false, updated_at: new Date().toISOString() },
        { onConflict: 'client_id,field' }
      )
      await logEvent(supabase, clientId, {
        kind: 'learned',
        source: 'overseer',
        title: `Recorded the ${(ENTITY_FIELD_LABELS[field] ?? field).toLowerCase()}: ${proposed}.`,
        detail: docName ? `Read it off ${docName} · ${Math.round(cf * 100)}% confidence.` : `${Math.round(cf * 100)}% confidence.`,
      })
      applied += 1
    } else {
      const reason = isVerified ? 'overwrites_verified' : conflict ? 'conflict' : 'low_confidence'
      // Newest proposal supersedes any older pending one for this field.
      await supabase.from('field_reviews').delete().eq('client_id', clientId).eq('field', field).eq('status', 'pending')
      await supabase.from('field_reviews').insert({
        client_id: clientId,
        field,
        proposed_value: proposed,
        current_value: current || null,
        confidence: cf,
        source_doc_id: docId,
        source_doc_name: docName,
        reason,
        status: 'pending',
      })
      queued += 1
    }
  }

  if (Object.keys(apply).length > 0) {
    await supabase.from('clients').update(apply).eq('id', clientId)
    await supabase.from('documents').update({ ai_applied: true }).eq('id', docId)
  }
  return { applied, queued }
}

// Mark fields as human-verified (hand-entered or approved) so no later AI guess
// can silently overwrite them, and clear any pending review for those fields.
export async function markVerified(supabase: DB, clientId: string, fields: string[], sourceDocId?: string | null) {
  const clean = fields.filter((f) => (ENTITY_APPLY_FIELDS as readonly string[]).includes(f))
  if (clean.length === 0) return
  const now = new Date().toISOString()
  await supabase.from('entity_field_meta').upsert(
    clean.map((field) => ({ client_id: clientId, field, verified: true, source_doc_id: sourceDocId ?? null, confidence: 1, updated_at: now })),
    { onConflict: 'client_id,field' }
  )
  await supabase
    .from('field_reviews')
    .delete()
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .in('field', clean)
}

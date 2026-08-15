import 'server-only'

import type { createClient } from '@/lib/supabase/server'

type DB = ReturnType<typeof createClient>

export type LogSource = 'system' | 'overseer' | 'operator'

export type LogEntry = {
  kind: string
  source: LogSource
  actor?: string
  title: string
  detail?: string | null
  meta?: unknown
  pinned?: boolean
  createdBy?: string | null
}

const defaultActor = (source: LogSource) => (source === 'overseer' ? 'Overseer' : source === 'operator' ? 'Operator' : 'System')

// Append one entry to an entity's registry. Best-effort: the registry is a
// record, not part of any transaction — a logging failure must never break the
// real action that produced the event.
export async function logEvent(supabase: DB, clientId: string, e: LogEntry): Promise<void> {
  try {
    await supabase.from('entity_log').insert({
      client_id: clientId,
      kind: e.kind,
      source: e.source,
      actor: e.actor ?? defaultActor(e.source),
      title: e.title,
      detail: e.detail ?? null,
      meta: e.meta ?? null,
      pinned: e.pinned ?? false,
      created_by: e.createdBy ?? null,
    })
  } catch {
    // swallow
  }
}

// The context the Overseer reads: every pinned standing fact (always relevant)
// plus a window of the most recent history. Deterministic — no tokens spent here;
// this is just handed to the on-demand assessment call.
export async function registryDigest(
  supabase: DB,
  clientId: string,
  recentLimit = 15
): Promise<{ standing_facts: string[]; recent_history: string[] }> {
  const [{ data: pinned }, { data: recent }] = await Promise.all([
    supabase
      .from('entity_log')
      .select('title, detail, at')
      .eq('client_id', clientId)
      .eq('pinned', true)
      .order('at', { ascending: false }),
    supabase
      .from('entity_log')
      .select('title, at, actor')
      .eq('client_id', clientId)
      .order('at', { ascending: false })
      .limit(recentLimit),
  ])

  const standing_facts = (pinned ?? []).map((r) =>
    r.detail ? `${r.title} — ${r.detail}` : (r.title as string)
  )
  const recent_history = (recent ?? []).map((r) => {
    const d = (r.at as string)?.slice(0, 10) ?? ''
    return `${d} · ${r.title}${r.actor && r.actor !== 'System' ? ` (${r.actor})` : ''}`
  })
  return { standing_facts, recent_history }
}

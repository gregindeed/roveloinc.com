import { createClient } from '@/lib/supabase/server'

// Per-user "recently opened" history, backed by the entity_views table.
// Cross-device: keyed on the user id, so it follows them everywhere they sign in.

type DB = ReturnType<typeof createClient>

export type RecentEntity = {
  id: string
  slug: string
  name: string
  kind: 'business' | 'individual'
}

// Bump (or create) the current user's view record for an entity. Best-effort —
// a failure here must never break opening the account, so errors are swallowed.
export async function recordEntityView(supabase: DB, userId: string, clientId: string): Promise<void> {
  try {
    await supabase
      .from('entity_views')
      .upsert(
        { user_id: userId, client_id: clientId, viewed_at: new Date().toISOString() },
        { onConflict: 'user_id,client_id' }
      )
  } catch {
    /* recents are non-critical */
  }
}

// The user's most-recently opened entities, newest first. Clients they can no
// longer see (RLS) or that are archived are dropped. Order is preserved.
export async function getRecentEntities(supabase: DB, userId: string, limit = 6): Promise<RecentEntity[]> {
  const { data: views } = await supabase
    .from('entity_views')
    .select('client_id, viewed_at')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(limit)

  const ids: string[] = (views ?? []).map((v: { client_id: string }) => v.client_id)
  if (ids.length === 0) return []

  const { data: cs } = await supabase.from('clients').select('id, slug, name, kind, archived_at').in('id', ids)
  type Row = { id: string; slug: string; name: string; kind?: string | null; archived_at?: string | null }
  const byId = new Map<string, Row>((cs ?? []).map((c: Row) => [c.id, c]))

  const out: RecentEntity[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (!c || c.archived_at) continue
    out.push({ id: c.id, slug: c.slug, name: c.name, kind: c.kind === 'individual' ? 'individual' : 'business' })
  }
  return out
}

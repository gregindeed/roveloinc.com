import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { isOnline } from '@/lib/presence'

type Admin = ReturnType<typeof createAdminClient>

export type PresenceUser = { id: string; name: string | null; email: string | null; avatarUrl: string | null }

// Who is currently working inside each of the given entities — read from the
// heartbeat's last_seen_client_id + last_seen_at. Returns a map keyed by
// client_id. Service-role read; callers pass only entity ids the viewer can see.
export async function entityPresence(
  admin: Admin,
  clientIds: string[],
  opts?: { excludeUserId?: string; emailById?: Map<string, string> }
): Promise<Map<string, PresenceUser[]>> {
  const out = new Map<string, PresenceUser[]>()
  const ids = Array.from(new Set(clientIds.filter(Boolean)))
  if (ids.length === 0) return out

  const { data: rows } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url, last_seen_at, last_seen_client_id')
    .in('last_seen_client_id', ids)

  const online = (rows ?? []).filter(
    (r) => r.last_seen_client_id && isOnline(r.last_seen_at as string | null) && r.id !== opts?.excludeUserId
  )
  if (online.length === 0) return out

  // Resolve emails (for avatar seed/label) unless the caller already has them.
  let emailById = opts?.emailById
  if (!emailById) {
    const { data: userList } = await admin.auth.admin.listUsers()
    emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '']))
  }

  for (const r of online) {
    const cid = r.last_seen_client_id as string
    const arr = out.get(cid) ?? []
    arr.push({
      id: r.id as string,
      name: (r.display_name as string | null) ?? null,
      email: emailById.get(r.id as string) ?? null,
      avatarUrl: (r.avatar_url as string | null) ?? null,
    })
    out.set(cid, arr)
  }
  return out
}

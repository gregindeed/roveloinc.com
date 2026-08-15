'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// One tiny write per active user per minute: stamp last_seen_at (and the entity
// they're currently in, if any). Column-whitelisted and scoped to the caller's
// own id, so it can only ever update presence — never role or ownership.
export async function ping(clientId?: string | null): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Only record the "currently viewing" entity if the caller can actually read
  // it (checked through their own RLS session). Otherwise a user could stamp
  // their presence onto an entity — even another firm's — they don't have access
  // to, making their avatar appear on that entity's presence UI.
  let seenClientId: string | null = null
  if (clientId) {
    const { data: c } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
    seenClientId = (c?.id as string | undefined) ?? null
  }

  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString(), last_seen_client_id: seenClientId })
    .eq('id', user.id)
}

'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Accept a per-property collaboration invite. The invitee may not yet have any
// RLS access to the grant row, so this reads/writes with the service-role client
// gated by the unguessable token.
export async function acceptCollaboration(token: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/collab/${token}`)

  const admin = createAdminClient()
  const { data: inv } = await admin
    .from('property_access')
    .select('id, property_id, status')
    .eq('token', token)
    .maybeSingle()
  if (!inv || inv.status === 'removed') redirect(`/collab/${token}`)
  const invite = inv as { id: string; property_id: string; status: string }

  if (invite.status !== 'active') {
    await admin
      .from('property_access')
      .update({ user_id: user.id, status: 'active', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
  }

  // Make sure the user can reach the work side. Never downgrade an existing admin.
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = (prof?.role as string | null) ?? null
  if (prof && role !== 'admin' && role !== 'collaborator') {
    await admin.from('profiles').update({ role: 'collaborator' }).eq('id', user.id)
  }

  redirect(`/admin/properties/${invite.property_id}`)
}

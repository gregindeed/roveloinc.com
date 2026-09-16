import { createAdminClient } from '@/lib/supabase/admin'
import type { Viewer } from '@/lib/auth'
import type { Lead } from '@/lib/leads'

// The org ids a viewer may see leads for: their firms (memberships) plus their
// profile org. Platform admins see every firm's leads.
function viewerOrgIds(viewer: Viewer): string[] {
  return Array.from(new Set([viewer.orgId, ...viewer.firms.map((f) => f.orgId)].filter(Boolean) as string[]))
}

// All leads the viewer may see, newest first. Uses the service-role client with
// an explicit org scope (mirrors the team/firms admin pages).
export async function getLeads(viewer: Viewer): Promise<Lead[]> {
  const admin = createAdminClient()
  let q = admin.from('leads').select('*').order('created_at', { ascending: false })
  if (!viewer.isPlatform) {
    const orgIds = viewerOrgIds(viewer)
    if (orgIds.length === 0) return []
    q = q.in('org_id', orgIds)
  }
  const { data } = await q
  return (data ?? []) as Lead[]
}

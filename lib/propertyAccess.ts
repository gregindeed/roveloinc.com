import { createAdminClient } from '@/lib/supabase/admin'
import type { Viewer } from '@/lib/auth'

// Can this viewer use the Property Management module at all?
//
// The module is OFF by default. A viewer gets in when ANY of these hold:
//   1. They're a platform super-admin (Rovelo staff) — always.
//   2. A firm they belong to has property_module enabled (the per-firm switch,
//      default false), toggled by an owner or platform admin.
//   3. They hold an active per-property grant (property_access) — e.g. a
//      third-party manager invited to a single property. RLS then scopes them
//      to just that property.
//
// Uses the service-role client for the two narrow, self-scoped reads so the
// gate never depends on RLS edge cases; both queries are keyed strictly to the
// authenticated viewer's own ids.
export async function canUsePropertyModule(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false
  if (viewer.isPlatform) return true

  const admin = createAdminClient()

  const orgIds = Array.from(
    new Set([viewer.orgId, ...viewer.firms.map((f) => f.orgId)].filter(Boolean) as string[])
  )
  if (orgIds.length > 0) {
    const { data } = await admin
      .from('organizations')
      .select('id')
      .in('id', orgIds)
      .eq('property_module', true)
      .limit(1)
    if (data && data.length > 0) return true
  }

  const { data: grants } = await admin
    .from('property_access')
    .select('id')
    .eq('user_id', viewer.userId)
    .eq('status', 'active')
    .limit(1)
  return !!(grants && grants.length > 0)
}

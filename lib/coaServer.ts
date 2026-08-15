import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Account } from '@/lib/types'

// Cached chart-of-accounts read, tag-invalidated on every chart edit.
//
// The chart is read on every financial tab (transactions, expenses, overview,
// settings, portal) but changes rarely — a textbook cache target. It's keyed
// and tagged by clientId; any chart write calls revalidateTag(`coa:${clientId}`)
// to bust it instantly, and a 1-hour backstop bounds staleness if a writer is
// ever missed.
//
// Why the service-role client: unstable_cache runs its fetcher outside request
// scope (e.g. on background revalidation), where the auth cookie — and thus the
// RLS session — isn't available. So we read with the service role and rely on
// the CALLER having already confirmed the current viewer may see this entity.
// Every caller does: the admin pages resolve the client under RLS and
// notFound() otherwise before reaching this, and the portal derives clientId
// from the viewer's own profile. The chart is entity-scoped and identical for
// every authorized viewer, so a clientId-keyed entry is correct for all of them.
export function getChartOfAccounts(clientId: string): Promise<Account[]> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()
      const { data } = await admin
        .from('chart_of_accounts')
        .select('*')
        .eq('client_id', clientId)
        .order('code')
      return (data ?? []) as Account[]
    },
    ['coa', clientId],
    { tags: [`coa:${clientId}`], revalidate: 3600 }
  )()
}

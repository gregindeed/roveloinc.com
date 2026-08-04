import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Privileged Supabase client using the SERVICE ROLE key.
 * This BYPASSES Row-Level Security, so it must ONLY ever be used inside
 * server actions/route handlers that have already verified the caller is an
 * admin. The `server-only` import above makes the build fail if this file is
 * ever imported into client-side code. The key comes from a NON-public env var
 * (SUPABASE_SERVICE_ROLE_KEY) so it is never sent to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

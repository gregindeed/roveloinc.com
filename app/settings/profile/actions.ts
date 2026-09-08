'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Normalize a typed handle to the stored form: lowercase, [a-z0-9_.] only.
function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '')
}

// Save the current user's own profile. Column-whitelisted on purpose: only
// display_name, handle, avatar_url — never role / is_owner / org_id — so this
// can't be used to escalate privileges even though it runs as service role.
export async function updateProfile(formData: FormData) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const fail = (msg: string): never => redirect(`/settings/profile?error=${encodeURIComponent(msg)}`)

  const display_name = String(formData.get('display_name') || '').trim().slice(0, 80) || null
  const avatar_url = String(formData.get('avatar_url') || '').trim() || null
  const handleRaw = String(formData.get('handle') || '')
  const handle = handleRaw ? normalizeHandle(handleRaw) : null

  if (handle !== null) {
    if (handle.length < 3 || handle.length > 30) fail('Handle must be 3–30 characters (letters, numbers, dots, underscores).')
  }

  const admin = createAdminClient()

  // Uniqueness: a handle can belong to only one person.
  if (handle) {
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .ilike('handle', handle)
      .neq('id', viewer.userId)
      .maybeSingle()
    if (taken) fail(`@${handle} is already taken — try another.`)
  }

  const { error } = await admin
    .from('profiles')
    .update({ display_name, handle, avatar_url })
    .eq('id', viewer.userId)
  if (error) fail(error.message)

  revalidatePath('/settings/profile')
  revalidatePath('/admin')
  redirect('/settings/profile?ok=' + encodeURIComponent(t(getLocale(), 'profile.saved')))
}

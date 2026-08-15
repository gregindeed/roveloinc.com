'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

// Save the current user's own profile. Column-whitelisted on purpose: only
// display_name (and later avatar_url) — never role / is_owner / org_id — so this
// can't be used to escalate privileges even though it runs as service role.
export async function updateProfile(formData: FormData) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  const display_name = String(formData.get('display_name') || '').trim().slice(0, 80) || null

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ display_name }).eq('id', viewer.userId)
  if (error) redirect(`/settings/profile?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/settings/profile')
  revalidatePath('/admin')
  redirect('/settings/profile?ok=' + encodeURIComponent(t(getLocale(), 'profile.saved')))
}

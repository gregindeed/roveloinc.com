'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isLocale, type Locale } from '@/lib/i18n'

// Switch language: set the cookie for instant effect, and persist on the profile
// so it follows the user across devices. Column-whitelisted to locale.
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return
  cookies().set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const admin = createAdminClient()
    await admin.from('profiles').update({ locale }).eq('id', user.id)
  }

  revalidatePath('/', 'layout')
}

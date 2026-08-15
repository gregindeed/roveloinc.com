'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, resetEmailHtml } from '@/lib/email'

function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) redirect(`/forgot-password?error=${encodeURIComponent('Enter your email address.')}`)

  const base = siteUrl()
  const admin = createAdminClient()

  // generateLink errors for unknown emails — we swallow it and always show the
  // same result, so this can't be used to probe which emails have accounts.
  const { data: link } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  const tokenHash = link?.properties?.hashed_token
  if (tokenHash) {
    const url = `${base}/auth/confirm?token_hash=${tokenHash}&type=recovery&next=/set-password`
    try {
      await sendEmail({ to: email, subject: 'Reset your Rovelo Inc password', html: resetEmailHtml(url) })
    } catch {
      // Don't leak send failures / account existence.
    }
  }

  redirect('/forgot-password?ok=1')
}

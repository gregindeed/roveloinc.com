import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, inviteEmailHtml } from '@/lib/email'

// Provision (or re-invite) a portal login for a client entity: create the
// invited auth user, link their profile to this client as a read-only 'client'
// role, and email them a secure set-password link. Shared by onboarding and the
// "invite later" flow in settings. Does NOT roll back the tenant — the caller
// decides what to do on failure.
export async function provisionPortalLogin(
  clientId: string,
  clientName: string,
  email: string,
  base: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  if (lErr || !link?.user) return { ok: false, error: lErr?.message ?? 'Could not create the login.' }

  const { error: pErr } = await admin
    .from('profiles')
    .update({ role: 'client', client_id: clientId })
    .eq('id', link.user.id)
  if (pErr) return { ok: false, error: `Login created, but linking failed: ${pErr.message}` }

  const tokenHash = link.properties?.hashed_token
  const setupUrl = `${base}/auth/confirm?token_hash=${tokenHash}&type=invite&next=/set-password`
  try {
    await sendEmail({
      to: email,
      subject: 'Your Rovelo Inc client portal',
      html: inviteEmailHtml(clientName, setupUrl),
    })
  } catch (e) {
    return { ok: false, error: `Login created, but the invite email failed: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
  return { ok: true }
}

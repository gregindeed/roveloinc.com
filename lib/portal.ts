import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, inviteEmailHtml, resetEmailHtml, portalMagicLinkEmailHtml } from '@/lib/email'

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

// The active portal login for a client entity (the auth user linked as 'client'),
// or null if none has been provisioned yet. Used to send that client a fresh
// sign-in or password-reset link on demand.
export async function portalLoginFor(clientId: string): Promise<{ userId: string; email: string } | null> {
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('id')
    .eq('client_id', clientId)
    .eq('role', 'client')
    .maybeSingle()
  if (!prof?.id) return null
  const { data: got } = await admin.auth.admin.getUserById(prof.id as string)
  const email = got?.user?.email
  return email ? { userId: prof.id as string, email } : null
}

// Email an EXISTING portal client a fresh way in:
//  - 'magiclink' logs them straight into the portal (no password)
//  - 'recovery'  lets them set a new password
// Reuses the same generateLink + /auth/confirm flow as invites and forgot-password.
export async function sendPortalLoginLink(
  email: string,
  kind: 'magiclink' | 'recovery',
  base: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: kind,
    email,
    options: { redirectTo: `${base}/auth/confirm` },
  })
  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) return { ok: false, error: error?.message ?? 'Could not create the link.' }

  const next = kind === 'recovery' ? '/set-password' : '/portal'
  const url = `${base}/auth/confirm?token_hash=${tokenHash}&type=${kind}&next=${next}`
  const subject = kind === 'recovery' ? 'Reset your Rovelo Inc password' : 'Your Rovelo Inc portal sign-in link'
  const html = kind === 'recovery' ? resetEmailHtml(url) : portalMagicLinkEmailHtml(url)
  try {
    await sendEmail({ to: email, subject, html })
  } catch (e) {
    return { ok: false, error: `Could not send the email: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
  return { ok: true }
}

import 'server-only'

const FROM = process.env.EMAIL_FROM ?? 'Rovelo Inc <noreply@roveloinc.com>'

/** Send an email via the Resend HTTP API (edge-compatible, no SDK needed). */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Resend error ${res.status}: ${detail}`)
  }
  return res.json()
}

/** Branded invite email sent to a newly-onboarded client. */
export function inviteEmailHtml(clientName: string, setupUrl: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Rovelo <span style="font-style:italic;color:#9ca3af;font-weight:400;">Inc.</span></div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <h1 style="font-size:18px;margin:0 0 12px;">Your client portal is ready</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px;">
        Rovelo Inc has set up a secure portal for <strong>${clientName}</strong> where you can view your
        bookkeeping reports and upload documents. Click below to set your password and sign in.
      </p>
      <a href="${setupUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:8px;">Set your password</a>
      <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">
        This link is single-use and expires. If you didn't expect this, you can ignore this email.
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">Rovelo Inc · San Diego, CA</p>
  </div>
</body></html>`
}

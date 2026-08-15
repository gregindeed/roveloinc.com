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

/** Branded invite email sent to a new team member (manager or collaborator). */
export type DigestItem = { name: string; url: string; reasons: string[]; level: 'critical' | 'warning' | 'info' }

/** Deterministic (no-LLM) daily firm brief: which entities need attention. */
export function firmDigestEmailHtml(firmName: string, dateLabel: string, items: DigestItem[]) {
  const dot = (lvl: string) => (lvl === 'critical' ? '#ef4444' : lvl === 'warning' ? '#f59e0b' : '#9ca3af')
  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot(i.level)};margin-right:8px;"></span>
          <a href="${i.url}" style="color:#111827;text-decoration:none;font-weight:600;font-size:14px;">${i.name}</a>
          <div style="color:#4b5563;font-size:13px;margin:3px 0 0 16px;">${i.reasons.join(' · ')}</div>
        </td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:6px;">Rovelo <span style="font-style:italic;color:#9ca3af;font-weight:400;">Inc.</span></div>
    <p style="font-size:12px;color:#9ca3af;margin:0 0 24px;">${firmName} · morning brief · ${dateLabel}</p>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px 28px;">
      <h1 style="font-size:16px;margin:0 0 4px;">${items.length} ${items.length === 1 ? 'entity needs' : 'entities need'} attention</h1>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">You're receiving this because you manage clients on Rovelo Inc.</p>
  </div>
</body></html>`
}

export function teamInviteEmailHtml(roleLabel: string, scopeLine: string, setupUrl: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Rovelo <span style="font-style:italic;color:#9ca3af;font-weight:400;">Inc.</span></div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <h1 style="font-size:18px;margin:0 0 12px;">You've been added to Rovelo Inc</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 8px;">
        You've been invited as a <strong>${roleLabel}</strong>. ${scopeLine}
      </p>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px;">
        Click below to set your password and sign in.
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

/** Branded password-reset email. */
export function resetEmailHtml(setupUrl: string) {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Rovelo <span style="font-style:italic;color:#9ca3af;font-weight:400;">Inc.</span></div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      <h1 style="font-size:18px;margin:0 0 12px;">Reset your password</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px;">
        We received a request to reset the password for your Rovelo Inc account. Click below to choose a new one.
      </p>
      <a href="${setupUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:8px;">Reset password</a>
      <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">
        This link is single-use and expires. If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">Rovelo Inc · San Diego, CA</p>
  </div>
</body></html>`
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
        bookkeeping reports and upload documents. Click below to access your portal and set your password.
      </p>
      <a href="${setupUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:8px;">Access portal</a>
      <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">
        This link is single-use and expires. If you didn't expect this, you can ignore this email.
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">Rovelo Inc · San Diego, CA</p>
  </div>
</body></html>`
}

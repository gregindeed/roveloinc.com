// Branded rent invoice / reminder / receipt email bodies, matching the Rovelo
// Inc house style from lib/email.ts. Pure functions (no server-only) — sent via
// the shared sendEmail() from lib/email.ts. Kept in their own file so the
// property module stays self-contained.

const usd = (n: number) => (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export type PayInstruction = { label: string; value: string }

function shell(inner: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:24px;">Rovelo <span style="font-style:italic;color:#9ca3af;font-weight:400;">Inc.</span></div>
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
      ${inner}
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:20px;">Rovelo Inc · San Diego, CA</p>
  </div>
</body></html>`
}

function lineRow(label: string, value: string, strong = false): string {
  return `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;">${label}</td>
    <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;color:#111827;${strong ? 'font-weight:700;' : ''}">${value}</td>
  </tr>`
}

// "How to pay" block, listing each configured method.
function payBlock(instructions: PayInstruction[]): string {
  if (!instructions.length) return ''
  const rows = instructions
    .map(
      (i) => `
      <div style="margin:8px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#9ca3af;">${i.label}</div>
        <div style="font-size:13px;color:#374151;white-space:pre-line;">${i.value}</div>
      </div>`
    )
    .join('')
  return `
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid #f3f4f6;">
      <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">How to pay</div>
      ${rows}
    </div>`
}

export type RentEmailInfo = {
  tenantName: string
  landlordName: string      // the owning entity (e.g. "Rovelo Holdings LLC")
  propertyName: string
  unitLabel: string
  periodLabel: string       // "August 2026"
}

// One builder for both the manual "Send invoice" and the automated reminders.
// `kind` shapes the heading/intro; everything else is shared.
export function rentInvoiceEmailHtml(
  i: RentEmailInfo & {
    invoiceNumber: string
    amountDue: number
    dueDate: string
    instructions?: PayInstruction[]
    kind?: 'invoice' | 'upcoming' | 'due' | 'overdue'
  }
): string {
  const where = `${i.propertyName}${i.unitLabel ? ` (${i.unitLabel})` : ''}`
  const heading =
    i.kind === 'overdue'
      ? `Rent past due — ${i.periodLabel}`
      : i.kind === 'upcoming'
        ? `Rent due soon — ${i.periodLabel}`
        : `Rent due — ${i.periodLabel}`
  const intro =
    i.kind === 'overdue'
      ? `Hi ${i.tenantName || 'there'}, our records show rent for <strong>${where}</strong> is past due. Please arrange payment at your earliest convenience.`
      : i.kind === 'upcoming'
        ? `Hi ${i.tenantName || 'there'}, a friendly reminder that rent for <strong>${where}</strong> is coming due.`
        : `Hi ${i.tenantName || 'there'}, this is a reminder that rent for <strong>${where}</strong> is due.`
  const rows = [
    lineRow('Invoice', i.invoiceNumber),
    lineRow('Property', `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`),
    lineRow('Period', i.periodLabel),
    lineRow('Due date', i.dueDate),
    lineRow('Amount due', usd(i.amountDue), true),
  ].join('')
  return shell(`
    <h1 style="font-size:18px;margin:0 0 12px;">${heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${payBlock(i.instructions ?? [])}
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
      Managed by ${i.landlordName} with Rovelo Inc. Reply to this email with any questions.
    </p>
  `)
}

// Invite a prospective tenant to fill out a rental application (Phase 3).
export function applicationInviteEmailHtml(i: {
  landlordName: string
  propertyName: string
  unitLabel: string
  url: string
}): string {
  const where = `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`
  return shell(`
    <h1 style="font-size:18px;margin:0 0 12px;">You're invited to apply</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 8px;">
      ${i.landlordName} has invited you to apply to rent <strong>${where}</strong>. The application takes a few minutes — you'll enter your contact details, income, and background-check consent.
    </p>
    <a href="${i.url}" style="display:inline-block;margin-top:8px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:8px;">Start your application</a>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">
      This is a private link just for you — please don't forward it. If you didn't expect this, you can ignore this email.
    </p>
  `)
}

// A plain message from the property manager to the tenant (Phase 4).
export function tenantMessageEmailHtml(i: {
  tenantName: string
  landlordName: string
  propertyName: string
  unitLabel: string
  subject: string
  body: string
}): string {
  const where = `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`
  return shell(`
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin:0 0 10px;">${where}</p>
    <h1 style="font-size:18px;margin:0 0 14px;">${i.subject}</h1>
    <div style="font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${i.body}</div>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:22px 0 0;">
      — ${i.landlordName}, via Rovelo Inc. Please reply to this email or contact your property manager with any questions.
    </p>
  `)
}

export function rentReceiptEmailHtml(
  i: RentEmailInfo & {
    receiptNumber: string
    amountPaid: number
    paidDate: string
    method?: string | null
    balance: number
    instructions?: PayInstruction[]
  }
): string {
  const where = `${i.propertyName}${i.unitLabel ? ` (${i.unitLabel})` : ''}`
  const settled = i.balance <= 0
  const rows = [
    lineRow('Receipt', i.receiptNumber),
    lineRow('Property', `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`),
    lineRow('Period', i.periodLabel),
    lineRow('Paid on', i.paidDate),
    i.method ? lineRow('Method', i.method) : '',
    lineRow('Amount paid', usd(i.amountPaid), true),
    lineRow('Remaining balance', settled ? 'Paid in full' : usd(i.balance)),
  ].join('')
  return shell(`
    <h1 style="font-size:18px;margin:0 0 12px;">Payment received — ${i.periodLabel}</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">
      Thank you, ${i.tenantName || 'there'}. We've recorded your rent payment for <strong>${where}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${settled ? '' : payBlock(i.instructions ?? [])}
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:18px 0 0;">
      Receipt ${i.receiptNumber} · issued by ${i.landlordName} via Rovelo Inc. Keep it for your records.
    </p>
  `)
}

// Sent to the applicant right after they submit — a receipt/confirmation.
export function applicationReceivedEmailHtml(i: {
  applicantName: string
  landlordName: string
  propertyName: string
  unitLabel: string
}): string {
  const where = `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`
  return shell(`
    <h1 style="font-size:18px;margin:0 0 12px;">Application received</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 12px;">
      Thanks${i.applicantName ? `, ${i.applicantName}` : ''} — we've received your rental application for <strong>${where}</strong>.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">
      ${i.landlordName} will review it and be in touch about next steps. No action is needed from you right now. You can keep this email for your records.
    </p>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0;">
      Submitted through Rovelo Inc on behalf of ${i.landlordName}. If you didn't apply, you can ignore this email.
    </p>
  `)
}

// Sent to the property manager when a prospect submits — a heads-up + link.
export function applicationSubmittedEmailHtml(i: {
  applicantName: string
  propertyName: string
  unitLabel: string
  email: string | null
  phone: string | null
  monthlyIncome: string | null
  url: string
}): string {
  const where = `${i.propertyName}${i.unitLabel ? ` · ${i.unitLabel}` : ''}`
  const rows = [
    lineRow('Applicant', i.applicantName || '—'),
    lineRow('Property', where),
    i.email ? lineRow('Email', i.email) : '',
    i.phone ? lineRow('Phone', i.phone) : '',
    i.monthlyIncome ? lineRow('Monthly income', i.monthlyIncome) : '',
  ].join('')
  return shell(`
    <h1 style="font-size:18px;margin:0 0 12px;">New rental application</h1>
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">
      A prospect just submitted an application for <strong>${where}</strong>. Review their full details and approve or decline in the portal.
    </p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <a href="${i.url}" style="display:inline-block;margin-top:18px;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 18px;border-radius:8px;">Review application</a>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:20px 0 0;">
      Sent by Rovelo Inc. Full application detail — including any background answers — is available in the portal, not this email.
    </p>
  `)
}

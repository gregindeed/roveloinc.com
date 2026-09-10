import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { rentInvoiceEmailHtml } from '@/lib/propertyEmail'
import { paymentInstructions, isoDate, monthLabel, type RentCharge, type Lease, type Property } from '@/lib/property'

type Admin = ReturnType<typeof createAdminClient>

// Don't re-nag more often than this (days), so a still-unpaid charge gets a
// reminder roughly weekly rather than every single cron run.
const MIN_REMINDER_INTERVAL_DAYS = 6
// Widest "coming due" window we even consider (a property's own lead is ≤ this).
const MAX_LEAD_DAYS = 10

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`)
  const b = new Date(`${toIso}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// Email tenants a reminder for rent that's coming due or overdue, with the
// property's payment instructions. Called from /api/cron on the daily schedule.
// Uses the service-role admin client (RLS bypassed) like the rest of the cron,
// and de-dupes via rent_charges.last_reminder_at so nobody gets spammed.
export async function sendRentReminders(admin: Admin, _base: string): Promise<{ sent: number; considered: number }> {
  const today = isoDate()
  const windowEnd = isoDate(new Date(Date.now() + MAX_LEAD_DAYS * 86_400_000))

  // Candidate charges: not fully paid, not waived, due within the window or past.
  const { data: chargeRows } = await admin
    .from('rent_charges')
    .select('*')
    .in('status', ['due', 'partial', 'overdue'])
    .lte('due_date', windowEnd)
  const charges = ((chargeRows ?? []) as RentCharge[]).filter(
    (c) => Number(c.amount_paid || 0) < Number(c.amount_due || 0)
  )
  if (charges.length === 0) return { sent: 0, considered: 0 }

  // Load the related leases, properties, units, and landlord names in bulk.
  const leaseIds = [...new Set(charges.map((c) => c.lease_id))]
  const unitIds = [...new Set(charges.map((c) => c.unit_id))]
  const { data: leaseRows } = await admin.from('leases').select('*').in('id', leaseIds)
  const leases = (leaseRows ?? []) as Lease[]
  const leaseById = new Map(leases.map((l) => [l.id, l]))

  const propertyIds = [...new Set(leases.map((l) => l.property_id))]
  const clientIds = [...new Set(leases.map((l) => l.client_id))]
  const [{ data: propRows }, { data: unitRows }, { data: clientRows }] = await Promise.all([
    admin.from('properties').select('*').in('id', propertyIds),
    admin.from('units').select('id, label').in('id', unitIds),
    admin.from('clients').select('id, name').in('id', clientIds),
  ])
  const propById = new Map(((propRows ?? []) as Property[]).map((p) => [p.id, p]))
  const unitLabel = new Map(((unitRows ?? []) as { id: string; label: string }[]).map((u) => [u.id, u.label]))
  const clientName = new Map(((clientRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))

  const now = Date.now()
  let sent = 0
  let considered = 0

  for (const c of charges) {
    const lease = leaseById.get(c.lease_id)
    if (!lease || !lease.tenant_email) continue
    const property = propById.get(lease.property_id)
    if (!property || !property.auto_reminders) continue

    const remaining = Number(c.amount_due || 0) - Number(c.amount_paid || 0)
    if (remaining <= 0) continue

    const due = c.due_date.slice(0, 10)
    const isOverdue = due < today
    const daysUntil = daysBetween(today, due)
    const lead = property.reminder_lead_days ?? MIN_REMINDER_INTERVAL_DAYS
    // Only remind once it's within this property's lead window (or already late).
    if (!isOverdue && daysUntil > lead) continue

    considered++

    // De-dupe: skip if we reminded recently.
    if (c.last_reminder_at) {
      const ageDays = (now - new Date(c.last_reminder_at).getTime()) / 86_400_000
      if (ageDays < MIN_REMINDER_INTERVAL_DAYS) continue
    }

    try {
      await sendEmail({
        to: lease.tenant_email,
        subject: isOverdue
          ? `Rent past due — ${monthLabel(c.period_month)} (${c.invoice_number})`
          : `Rent reminder — ${monthLabel(c.period_month)} (${c.invoice_number})`,
        html: rentInvoiceEmailHtml({
          tenantName: lease.tenant_name,
          landlordName: clientName.get(lease.client_id) ?? 'Your landlord',
          propertyName: property.name,
          unitLabel: unitLabel.get(c.unit_id) ?? '',
          periodLabel: monthLabel(c.period_month),
          invoiceNumber: c.invoice_number,
          amountDue: remaining,
          dueDate: due,
          instructions: paymentInstructions(property),
          kind: isOverdue ? 'overdue' : 'upcoming',
        }),
      })
      sent++
      // Mark reminded; promote a past-due line to 'overdue' while we're here.
      const patch: Record<string, unknown> = {
        last_reminder_at: new Date().toISOString(),
        reminder_count: Number(c.reminder_count || 0) + 1,
      }
      if (isOverdue && c.status !== 'overdue') patch.status = 'overdue'
      await admin.from('rent_charges').update(patch).eq('id', c.id)
    } catch {
      // best-effort; keep going
    }
  }

  return { sent, considered }
}

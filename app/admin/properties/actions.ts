'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { rentInvoiceEmailHtml, rentReceiptEmailHtml } from '@/lib/propertyEmail'
import {
  dueDateFor,
  firstOfMonth,
  isoDate,
  monthsFrom,
  monthLabel,
  paymentInstructions,
  type Lease,
  type RentCharge,
  type PropertyType,
} from '@/lib/property'

// All writes go through the RLS server client, so Postgres enforces that the
// caller may write the owning entity (can_write_entity): owner/managers, or a
// collaborator granted that entity. Portal clients are read-only and can't
// reach these forms. We still resolve the viewer to bounce non-workers early.
async function requireWorker() {
  const v = await getViewer()
  if (!v) redirect('/login')
  if (v.role !== 'admin' && v.role !== 'collaborator') redirect('/portal')
  return v
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k)
  if (v === '') return null
  const n = Number(v.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function backToProperty(id: string, msg: string, kind: 'ok' | 'error' = 'ok'): never {
  revalidatePath(`/admin/properties/${id}`)
  revalidatePath('/admin/properties')
  redirect(`/admin/properties/${id}?${kind}=${encodeURIComponent(msg)}`)
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Owner (landlord entity) quick-create ────────────────────────────────────
// Create a minimal client entity to own a property, without leaving the New
// property page. Managers/owner only (matches client creation elsewhere); it's
// a real entity, so it also appears in the normal clients roster.
export async function createOwner(formData: FormData) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin') {
    redirect('/admin/properties/new?error=' + encodeURIComponent('Only managers can add a new owner. Pick an existing owner, or ask an admin.'))
  }
  const admin = createAdminClient()
  const name = str(formData, 'name')
  if (!name) redirect('/admin/properties/new?error=' + encodeURIComponent('Owner name is required.'))
  const kind = str(formData, 'kind') === 'individual' ? 'individual' : 'business'
  const ownerName = str(formData, 'owner_name') || null
  const address = str(formData, 'address') || null

  const baseSlug = slugify(name) || 'owner'
  let slug = baseSlug
  let created: { id: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from('clients')
      .insert({ name, slug, org_id: viewer.orgId ?? null, kind, owner_name: ownerName, address })
      .select('id')
      .single()
    if (!error && data) {
      created = data as { id: string }
      break
    }
    if (error && (error as { code?: string }).code === '23505') {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    redirect('/admin/properties/new?error=' + encodeURIComponent(error?.message ?? 'Could not create the owner.'))
  }
  if (!created) redirect('/admin/properties/new?error=' + encodeURIComponent('Could not create the owner — try a different name.'))

  revalidatePath('/admin/properties/new')
  redirect(`/admin/properties/new?owner=${created.id}&ok=` + encodeURIComponent(`Owner "${name}" created — it's selected below.`))
}

// ── Property ────────────────────────────────────────────────────────────────

export async function createProperty(formData: FormData) {
  await requireWorker()
  const supabase = createClient()

  const clientId = str(formData, 'client_id')
  const name = str(formData, 'name')
  const address = str(formData, 'address') || null
  const placeId = str(formData, 'place_id') || null
  const lat = num(formData, 'lat')
  const lng = num(formData, 'lng')
  const type = (str(formData, 'type') || 'residential') as PropertyType
  const notes = str(formData, 'notes') || null

  if (!clientId) redirect('/admin/properties/new?error=' + encodeURIComponent('Pick which owner this property belongs to.'))
  if (!name) redirect('/admin/properties/new?error=' + encodeURIComponent('A property name is required.'))

  // Inherit the org from the owning entity so the property scopes with it.
  const { data: client } = await supabase.from('clients').select('org_id').eq('id', clientId).maybeSingle()

  const { data: created, error } = await supabase
    .from('properties')
    .insert({
      client_id: clientId,
      org_id: (client?.org_id as string | null) ?? null,
      name,
      address,
      place_id: placeId,
      lat,
      lng,
      type,
      notes,
    })
    .select('id')
    .single()
  if (error || !created) {
    redirect('/admin/properties/new?error=' + encodeURIComponent(error?.message ?? 'Could not create the property.'))
  }

  revalidatePath('/admin/properties')
  redirect(`/admin/properties/${created.id}?ok=` + encodeURIComponent('Property created. Add units and tenants below.'))
}

export async function updateProperty(id: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()
  const patch = {
    name: str(formData, 'name'),
    address: str(formData, 'address') || null,
    type: (str(formData, 'type') || 'residential') as PropertyType,
    notes: str(formData, 'notes') || null,
  }
  if (!patch.name) backToProperty(id, 'A property name is required.', 'error')
  const { error } = await supabase.from('properties').update(patch).eq('id', id)
  if (error) backToProperty(id, error.message, 'error')
  backToProperty(id, 'Property updated.')
}

export async function archiveProperty(id: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('properties').update({ archived_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/properties')
  redirect('/admin/properties?ok=' + encodeURIComponent('Property archived.'))
}

// ── Units ───────────────────────────────────────────────────────────────────

export async function addUnit(propertyId: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()

  const { data: prop } = await supabase.from('properties').select('client_id').eq('id', propertyId).maybeSingle()
  if (!prop) backToProperty(propertyId, 'Property not found.', 'error')

  const { error } = await supabase.from('units').insert({
    property_id: propertyId,
    client_id: (prop as { client_id: string }).client_id,
    label: str(formData, 'label') || 'Unit',
    bedrooms: num(formData, 'bedrooms'),
    bathrooms: num(formData, 'bathrooms'),
    sqft: num(formData, 'sqft'),
    market_rent: num(formData, 'market_rent'),
    notes: str(formData, 'notes') || null,
  })
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Unit added.')
}

// ── Leases (tenancies) ──────────────────────────────────────────────────────

export async function createLease(propertyId: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()

  const unitId = str(formData, 'unit_id')
  if (!unitId) backToProperty(propertyId, 'Pick a unit for this tenant.', 'error')

  const { data: unit } = await supabase.from('units').select('client_id, property_id').eq('id', unitId).maybeSingle()
  if (!unit) backToProperty(propertyId, 'Unit not found.', 'error')
  const u = unit as { client_id: string; property_id: string }

  const tenantName = str(formData, 'tenant_name')
  if (!tenantName) backToProperty(propertyId, 'A tenant name is required.', 'error')

  const startDate = str(formData, 'start_date') || null
  const dueDay = num(formData, 'rent_due_day') ?? 1
  const status: Lease['status'] = startDate && startDate > isoDate() ? 'upcoming' : 'active'

  const { error } = await supabase.from('leases').insert({
    unit_id: unitId,
    property_id: u.property_id,
    client_id: u.client_id,
    tenant_name: tenantName,
    tenant_email: str(formData, 'tenant_email') || null,
    tenant_phone: str(formData, 'tenant_phone') || null,
    rent_amount: num(formData, 'rent_amount') ?? 0,
    deposit_amount: num(formData, 'deposit_amount'),
    rent_due_day: Math.min(Math.max(dueDay, 1), 28),
    start_date: startDate,
    end_date: str(formData, 'end_date') || null,
    status,
    notes: str(formData, 'notes') || null,
  })
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, `${tenantName} added as tenant.`)
}

export async function endLease(propertyId: string, leaseId: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('leases').update({ status: 'ended', end_date: isoDate() }).eq('id', leaseId)
  backToProperty(propertyId, 'Lease ended.')
}

// ── Rent schedule + payments (the tracker) ──────────────────────────────────

// Create rent-charge rows for `months` consecutive months starting at the given
// month (or the current month), skipping any that already exist for the lease.
export async function generateRentSchedule(propertyId: string, leaseId: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()

  const { data: leaseRow } = await supabase.from('leases').select('*').eq('id', leaseId).maybeSingle()
  if (!leaseRow) backToProperty(propertyId, 'Lease not found.', 'error')
  const lease = leaseRow as Lease

  const start = str(formData, 'start_month') || firstOfMonth()
  const count = Math.min(Math.max(num(formData, 'months') ?? 12, 1), 24)
  const periods = monthsFrom(start, count)

  const { data: existing } = await supabase.from('rent_charges').select('period_month').eq('lease_id', leaseId)
  const have = new Set(((existing ?? []) as { period_month: string }[]).map((r) => r.period_month.slice(0, 10)))

  const rows = periods
    .filter((p) => !have.has(p))
    .map((period) => ({
      lease_id: lease.id,
      unit_id: lease.unit_id,
      client_id: lease.client_id,
      period_month: period,
      due_date: dueDateFor(period, lease.rent_due_day),
      amount_due: Number(lease.rent_amount || 0),
      amount_paid: 0,
      status: 'due' as const,
    }))

  if (rows.length === 0) backToProperty(propertyId, 'Those months are already scheduled.')
  const { error } = await supabase.from('rent_charges').insert(rows)
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, `Scheduled ${rows.length} month${rows.length === 1 ? '' : 's'} of rent.`)
}

export async function recordPayment(propertyId: string, chargeId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()

  const { data: chargeRow } = await supabase.from('rent_charges').select('*').eq('id', chargeId).maybeSingle()
  if (!chargeRow) backToProperty(propertyId, 'Charge not found.', 'error')
  const charge = chargeRow as RentCharge

  const pay = num(formData, 'amount') ?? 0
  if (pay <= 0) backToProperty(propertyId, 'Enter a payment amount greater than zero.', 'error')
  const paidDate = str(formData, 'paid_date') || isoDate()
  const method = str(formData, 'method') || null
  const reference = str(formData, 'reference') || null

  // 1) Record the payment as its own row — this mints a unique receipt number.
  const { data: payment, error: pErr } = await supabase
    .from('rent_payments')
    .insert({
      charge_id: charge.id,
      lease_id: charge.lease_id,
      unit_id: charge.unit_id,
      client_id: charge.client_id,
      amount: pay,
      paid_date: paidDate,
      method,
      reference,
      created_by: viewer.userId,
    })
    .select('receipt_number')
    .single()
  if (pErr || !payment) backToProperty(propertyId, pErr?.message ?? 'Could not record the payment.', 'error')
  const receiptNumber = payment.receipt_number as string

  // 2) Roll the charge's paid total up from all its payments (handles partials).
  const { data: allPays } = await supabase.from('rent_payments').select('amount').eq('charge_id', charge.id)
  const newPaid = ((allPays ?? []) as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0)
  const status: RentCharge['status'] = newPaid >= Number(charge.amount_due || 0) ? 'paid' : newPaid > 0 ? 'partial' : 'due'
  await supabase
    .from('rent_charges')
    .update({ amount_paid: newPaid, paid_date: paidDate, method, reference, status })
    .eq('id', charge.id)

  // 3) Email the tenant a numbered receipt. This is the default on every recorded
  //    payment (there's no auto-pay yet, so a payment is always entered by hand);
  //    unticking "Email receipt" on the form opts out. Silently no-ops if the
  //    lease has no tenant email.
  let emailedTo: string | null = null
  if (str(formData, 'send_receipt') === 'on') {
    const info = await rentContext(supabase, charge)
    if (info?.tenantEmail) {
      try {
        await sendEmail({
          to: info.tenantEmail,
          subject: `Rent receipt ${receiptNumber} — ${monthLabel(charge.period_month)}`,
          html: rentReceiptEmailHtml({
            tenantName: info.tenantName,
            landlordName: info.landlordName,
            propertyName: info.propertyName,
            unitLabel: info.unitLabel,
            periodLabel: monthLabel(charge.period_month),
            receiptNumber,
            amountPaid: pay,
            paidDate,
            method,
            balance: Number(charge.amount_due || 0) - newPaid,
            instructions: info.instructions,
          }),
        })
        emailedTo = info.tenantEmail
      } catch {
        backToProperty(propertyId, `Payment recorded (receipt ${receiptNumber}), but the receipt email failed to send.`, 'error')
      }
    }
  }
  backToProperty(
    propertyId,
    emailedTo
      ? `Payment recorded · receipt ${receiptNumber} emailed to ${emailedTo}.`
      : `Payment recorded · receipt ${receiptNumber}.`
  )
}

// Edit how tenants pay + reminder behavior for a property.
export async function updatePaymentSettings(id: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()
  const { error } = await supabase
    .from('properties')
    .update({
      pay_zelle: str(formData, 'pay_zelle') || null,
      pay_bank: str(formData, 'pay_bank') || null,
      pay_check: str(formData, 'pay_check') || null,
      pay_other: str(formData, 'pay_other') || null,
      auto_reminders: str(formData, 'auto_reminders') === 'on',
      reminder_lead_days: Math.min(Math.max(num(formData, 'reminder_lead_days') ?? 5, 0), 10),
    })
    .eq('id', id)
  if (error) backToProperty(id, error.message, 'error')
  backToProperty(id, 'Payment settings saved.')
}

export async function waiveCharge(propertyId: string, chargeId: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('rent_charges').update({ status: 'waived' }).eq('id', chargeId)
  backToProperty(propertyId, 'Charge waived.')
}

export async function sendRentInvoice(propertyId: string, chargeId: string) {
  await requireWorker()
  const supabase = createClient()

  const { data: chargeRow } = await supabase.from('rent_charges').select('*').eq('id', chargeId).maybeSingle()
  if (!chargeRow) backToProperty(propertyId, 'Charge not found.', 'error')
  const charge = chargeRow as RentCharge

  const info = await rentContext(supabase, charge)
  if (!info?.tenantEmail) backToProperty(propertyId, 'No tenant email on file for this lease.', 'error')

  const overdue = charge.due_date.slice(0, 10) < isoDate()
  try {
    await sendEmail({
      to: info.tenantEmail,
      subject: `${overdue ? 'Rent past due' : 'Rent due'} ${charge.invoice_number} — ${monthLabel(charge.period_month)}`,
      html: rentInvoiceEmailHtml({
        tenantName: info.tenantName,
        landlordName: info.landlordName,
        propertyName: info.propertyName,
        unitLabel: info.unitLabel,
        periodLabel: monthLabel(charge.period_month),
        invoiceNumber: charge.invoice_number,
        amountDue: Number(charge.amount_due || 0) - Number(charge.amount_paid || 0),
        dueDate: charge.due_date,
        instructions: info.instructions,
        kind: overdue ? 'overdue' : 'invoice',
      }),
    })
  } catch (e) {
    backToProperty(propertyId, `Could not send the invoice: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
  }
  backToProperty(propertyId, `Invoice ${charge.invoice_number} emailed to ${info.tenantEmail}.`)
}

// Resolve the tenant / property / landlord labels (and payment instructions) a
// rent email needs.
async function rentContext(
  supabase: ReturnType<typeof createClient>,
  charge: RentCharge
): Promise<{
  tenantName: string
  tenantEmail: string
  landlordName: string
  propertyName: string
  unitLabel: string
  instructions: { label: string; value: string }[]
} | null> {
  const { data: lease } = await supabase.from('leases').select('*').eq('id', charge.lease_id).maybeSingle()
  if (!lease) return null
  const l = lease as Lease
  const [{ data: unit }, { data: property }, { data: client }] = await Promise.all([
    supabase.from('units').select('label').eq('id', charge.unit_id).maybeSingle(),
    supabase.from('properties').select('name, pay_zelle, pay_bank, pay_check, pay_other').eq('id', l.property_id).maybeSingle(),
    supabase.from('clients').select('name').eq('id', l.client_id).maybeSingle(),
  ])
  const p = (property ?? {}) as { name?: string; pay_zelle?: string | null; pay_bank?: string | null; pay_check?: string | null; pay_other?: string | null }
  return {
    tenantName: l.tenant_name,
    tenantEmail: l.tenant_email ?? '',
    landlordName: (client?.name as string) ?? 'Your landlord',
    propertyName: p.name ?? 'your rental',
    unitLabel: (unit?.label as string) ?? '',
    instructions: paymentInstructions({
      pay_zelle: p.pay_zelle ?? null,
      pay_bank: p.pay_bank ?? null,
      pay_check: p.pay_check ?? null,
      pay_other: p.pay_other ?? null,
    }),
  }
}

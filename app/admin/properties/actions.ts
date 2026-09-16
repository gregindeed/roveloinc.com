'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewer } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { rentInvoiceEmailHtml, rentReceiptEmailHtml, tenantMessageEmailHtml, applicationInviteEmailHtml } from '@/lib/propertyEmail'
import { encryptSecret } from '@/lib/crypto'
import { parsePropertyDoc } from '@/lib/propertyAi'
import {
  dueDateFor,
  firstOfMonth,
  isoDate,
  monthsFrom,
  monthLabel,
  paymentInstructions,
  normalizeExpenseCategory,
  type Lease,
  type RentCharge,
  type PropertyType,
  type PropertyDocument,
} from '@/lib/property'

const DOCS_BUCKET = 'client-docs'

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

// Base URL of the current deployment, from the request host.
function siteUrl(): string {
  const host = headers().get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
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
  const multiUnit = str(formData, 'multi_unit') === '1'
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
      multi_unit: multiUnit,
      notes,
    })
    .select('id')
    .single()
  if (error || !created) {
    redirect('/admin/properties/new?error=' + encodeURIComponent(error?.message ?? 'Could not create the property.'))
  }

  // Single-family / single-unit: create the one implicit unit now (with the home
  // details entered at onboarding), so the user never manages "units".
  if (!multiUnit) {
    await supabase.from('units').insert({
      property_id: created.id,
      client_id: clientId,
      label: 'Home',
      bedrooms: num(formData, 'bedrooms'),
      bathrooms: num(formData, 'bathrooms'),
      sqft: num(formData, 'sqft'),
      market_rent: num(formData, 'market_rent'),
    })
  }

  revalidatePath('/admin/properties')
  redirect(
    `/admin/properties/${created.id}?ok=` +
      encodeURIComponent(multiUnit ? 'Property created. Add its units below.' : 'Property created.')
  )
}

export async function updateProperty(id: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()
  const name = str(formData, 'name')
  if (!name) backToProperty(id, 'A property name is required.', 'error')
  const patch = {
    name,
    address: str(formData, 'address') || null,
    place_id: str(formData, 'place_id') || null,
    lat: num(formData, 'lat'),
    lng: num(formData, 'lng'),
    type: (str(formData, 'type') || 'residential') as PropertyType,
    multi_unit: str(formData, 'multi_unit') === 'on',
    year_built: num(formData, 'year_built'),
    lot_size: str(formData, 'lot_size') || null,
    parcel_number: str(formData, 'parcel_number') || null,
    est_value: num(formData, 'est_value'),
    purchase_price: num(formData, 'purchase_price'),
    purchase_date: str(formData, 'purchase_date') || null,
    notes: str(formData, 'notes') || null,
  }
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

export async function updateUnit(propertyId: string, unitId: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()
  const { error } = await supabase
    .from('units')
    .update({
      label: str(formData, 'label') || 'Unit',
      bedrooms: num(formData, 'bedrooms'),
      bathrooms: num(formData, 'bathrooms'),
      sqft: num(formData, 'sqft'),
      market_rent: num(formData, 'market_rent'),
      notes: str(formData, 'notes') || null,
    })
    .eq('id', unitId)
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Unit updated.')
}

// Remove a unit — only when it carries no lease history, so we never cascade
// away tenants + payments by accident. End/clear its leases first otherwise.
export async function deleteUnit(propertyId: string, unitId: string) {
  await requireWorker()
  const supabase = createClient()
  const { count } = await supabase.from('leases').select('id', { count: 'exact', head: true }).eq('unit_id', unitId)
  if ((count ?? 0) > 0) {
    backToProperty(propertyId, 'This unit has tenant history — end and remove its leases before deleting it.', 'error')
  }
  const { error } = await supabase.from('units').delete().eq('id', unitId)
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Unit removed.')
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

// Persist a generated HTML billing document (receipt / invoice / statement) into
// the docs bucket + property_documents so it appears on the property's Documents
// shelf. Best-effort: never throws — a storage/db hiccup here must not fail the
// payment or invoice it accompanies.
async function saveGeneratedDoc(
  supabase: ReturnType<typeof createClient>,
  d: {
    clientId: string
    propertyId: string
    unitId: string | null
    leaseId: string | null
    name: string
    kind: string
    html: string
  }
): Promise<void> {
  try {
    const bytes = new TextEncoder().encode(d.html)
    const path = `${d.clientId}/property/${d.propertyId}/generated/${Date.now()}-${d.kind}.html`
    const { error: upErr } = await supabase.storage
      .from(DOCS_BUCKET)
      .upload(path, bytes, { contentType: 'text/html', upsert: false })
    if (upErr) return
    await supabase.from('property_documents').insert({
      client_id: d.clientId,
      property_id: d.propertyId,
      unit_id: d.unitId,
      lease_id: d.leaseId,
      name: d.name.slice(0, 200),
      storage_path: path,
      content_type: 'text/html',
      size_bytes: bytes.byteLength,
      doc_kind: d.kind,
      uploaded_by: null,
    })
  } catch {
    // best-effort — swallow
  }
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
  const info = await rentContext(supabase, charge)
  if (info) {
    const receiptHtml = rentReceiptEmailHtml({
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
    })

    // Always keep a copy of the receipt on the Documents shelf.
    await saveGeneratedDoc(supabase, {
      clientId: charge.client_id,
      propertyId,
      unitId: charge.unit_id,
      leaseId: charge.lease_id,
      name: `Receipt ${receiptNumber} · ${monthLabel(charge.period_month)}`,
      kind: 'receipt',
      html: receiptHtml,
    })

    // Email the tenant the same receipt (default on; untick "Email receipt" to
    // opt out). No-ops silently if the lease has no tenant email.
    if (str(formData, 'send_receipt') === 'on' && info.tenantEmail) {
      try {
        await sendEmail({
          to: info.tenantEmail,
          subject: `Rent receipt ${receiptNumber} — ${monthLabel(charge.period_month)}`,
          html: receiptHtml,
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
  const invoiceHtml = rentInvoiceEmailHtml({
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
  })
  try {
    await sendEmail({
      to: info.tenantEmail,
      subject: `${overdue ? 'Rent past due' : 'Rent due'} ${charge.invoice_number} — ${monthLabel(charge.period_month)}`,
      html: invoiceHtml,
    })
  } catch (e) {
    backToProperty(propertyId, `Could not send the invoice: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
  }
  // Keep a copy of the invoice on the Documents shelf.
  await saveGeneratedDoc(supabase, {
    clientId: charge.client_id,
    propertyId,
    unitId: charge.unit_id,
    leaseId: charge.lease_id,
    name: `Invoice ${charge.invoice_number} · ${monthLabel(charge.period_month)}`,
    kind: 'invoice',
    html: invoiceHtml,
  })
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

// ── Tenant profiles (Phase 2) ───────────────────────────────────────────────
// Full tenant record for a lease. SSN is encrypted at rest via lib/crypto; only
// the last 4 are kept in clear for display. A blank SSN field keeps the stored
// value (so editing other fields never wipes it).
export async function saveTenantProfile(propertyId: string, leaseId: string, formData: FormData) {
  await requireWorker()
  const supabase = createClient()
  const { data: lease } = await supabase.from('leases').select('client_id').eq('id', leaseId).maybeSingle()
  if (!lease) backToProperty(propertyId, 'Lease not found.', 'error')
  const clientId = (lease as { client_id: string }).client_id

  const patch: Record<string, unknown> = {
    client_id: clientId,
    lease_id: leaseId,
    dob: str(formData, 'dob') || null,
    current_address: str(formData, 'current_address') || null,
    employer: str(formData, 'employer') || null,
    monthly_income: num(formData, 'monthly_income'),
    emergency_contact_name: str(formData, 'emergency_contact_name') || null,
    emergency_contact_phone: str(formData, 'emergency_contact_phone') || null,
    id_type: str(formData, 'id_type') || null,
    notes: str(formData, 'notes') || null,
    updated_at: new Date().toISOString(),
  }
  const ssnRaw = str(formData, 'ssn').replace(/\D/g, '')
  if (ssnRaw) {
    if (ssnRaw.length < 4) backToProperty(propertyId, 'Enter a full SSN or leave it blank.', 'error')
    patch.ssn_enc = await encryptSecret(ssnRaw)
    patch.ssn_last4 = ssnRaw.slice(-4)
  }

  const { error } = await supabase.from('tenant_profiles').upsert(patch, { onConflict: 'lease_id' })
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Tenant profile saved.')
}

// ── Property documents (Phase 2) ────────────────────────────────────────────
export async function uploadPropertyDoc(propertyId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: prop } = await supabase.from('properties').select('client_id').eq('id', propertyId).maybeSingle()
  if (!prop) backToProperty(propertyId, 'Property not found.', 'error')
  const clientId = (prop as { client_id: string }).client_id

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) backToProperty(propertyId, 'Choose a file to upload.', 'error')
  const f = file as File
  if (f.size > 15 * 1024 * 1024) backToProperty(propertyId, 'File is too large (max 15MB).', 'error')

  const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'file'
  const path = `${clientId}/property/${propertyId}/${Date.now()}-${safeName}`
  const bytes = new Uint8Array(await f.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, bytes, { contentType: f.type || 'application/octet-stream', upsert: false })
  if (upErr) backToProperty(propertyId, `Upload failed: ${upErr.message}`, 'error')

  const { data: inserted, error } = await supabase
    .from('property_documents')
    .insert({
      client_id: clientId,
      property_id: propertyId,
      unit_id: str(formData, 'unit_id') || null,
      lease_id: str(formData, 'lease_id') || null,
      name: f.name.slice(0, 200),
      storage_path: path,
      content_type: f.type || null,
      size_bytes: f.size,
      doc_kind: str(formData, 'doc_kind') || 'other',
      uploaded_by: viewer.userId,
    })
    .select('*')
    .single()
  if (error || !inserted) backToProperty(propertyId, error?.message ?? 'Could not save the document.', 'error')

  // Documents flow: let the Overseer read it right away (opt-out on the form).
  if (str(formData, 'overseer_read') === 'on') {
    const res = await runOverseerParse(supabase, propertyId, inserted as PropertyDocument)
    backToProperty(
      propertyId,
      res.ok ? 'Document uploaded — the Overseer read it and filled in what it could.' : `Document uploaded, but ${res.msg}`,
      res.ok ? 'ok' : 'error'
    )
  }
  backToProperty(propertyId, 'Document uploaded.')
}

// Arrange a property's photos: make one the cover (hero) or nudge it left/right.
// Renumbers every photo 0..n-1 so the order stays clean and the hero is always
// the lowest sort_order.
export async function arrangePhoto(propertyId: string, docId: string, op: 'cover' | 'left' | 'right') {
  await requireWorker()
  const supabase = createClient()

  const { data: rows } = await supabase
    .from('property_documents')
    .select('id')
    .eq('property_id', propertyId)
    .eq('doc_kind', 'photo')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id)

  const from = ids.indexOf(docId)
  if (from === -1) backToProperty(propertyId, 'Photo not found.', 'error')
  if (op === 'cover' && from === 0) backToProperty(propertyId, 'Already the cover photo.')

  let to = from
  if (op === 'cover') to = 0
  else if (op === 'left') to = Math.max(0, from - 1)
  else if (op === 'right') to = Math.min(ids.length - 1, from + 1)
  if (to === from) backToProperty(propertyId, 'Photo order unchanged.')

  ids.splice(from, 1)
  ids.splice(to, 0, docId)

  await Promise.all(ids.map((id, i) => supabase.from('property_documents').update({ sort_order: i }).eq('id', id)))
  backToProperty(propertyId, op === 'cover' ? 'Cover photo updated.' : 'Photo order updated.')
}

const DOC_KINDS = ['photo', 'lease_agreement', 'id', 'application', 'insurance', 'inspection', 'tax', 'statement', 'receipt', 'invoice', 'notice', 'other']

// Have the Overseer read a document and fill EMPTY property/unit fields from it.
// Core Overseer parse: reads a stored PDF/image, writes the summary, may
// reclassify doc_kind, and fills EMPTY property/unit fields. Returns a result —
// never redirects — so both the manual button and auto-read-on-upload can use it.
async function runOverseerParse(
  supabase: ReturnType<typeof createClient>,
  propertyId: string,
  d: PropertyDocument
): Promise<{ ok: boolean; msg: string }> {
  const media = d.content_type || ''
  const ext = (d.name.split('.').pop() || '').toLowerCase()
  const isPdf = media === 'application/pdf' || ext === 'pdf'
  const isImg = media.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
  if (!isPdf && !isImg) {
    return { ok: false, msg: 'The Overseer reads PDFs and images — this file type is stored but not auto-readable.' }
  }

  await supabase.from('property_documents').update({ ai_status: 'pending' }).eq('id', d.id)
  try {
    const { data: signed, error: sErr } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(d.storage_path, 300)
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || 'Could not create a link to the file.')
    const mt = isPdf ? 'application/pdf' : media.startsWith('image/') ? media : 'image/png'
    const facts = await parsePropertyDoc({ mediaType: mt, url: signed.signedUrl })

    await supabase
      .from('property_documents')
      .update({
        ai_status: 'parsed',
        ai_summary: facts.summary,
        ai_fields: facts.fields,
        ...(facts.doc_kind && DOC_KINDS.includes(facts.doc_kind) ? { doc_kind: facts.doc_kind } : {}),
      })
      .eq('id', d.id)

    // Property-level facts → fill only empty columns (non-destructive).
    const { data: propRow } = await supabase
      .from('properties')
      .select('year_built, lot_size, parcel_number, est_value, purchase_price')
      .eq('id', propertyId)
      .maybeSingle()
    const p = (propRow ?? {}) as {
      year_built: number | null
      lot_size: string | null
      parcel_number: string | null
      est_value: number | null
      purchase_price: number | null
    }
    const propPatch: Record<string, unknown> = {}
    if (facts.year_built != null && p.year_built == null) propPatch.year_built = facts.year_built
    if (facts.lot_size && !p.lot_size) propPatch.lot_size = facts.lot_size
    if (facts.parcel_number && !p.parcel_number) propPatch.parcel_number = facts.parcel_number
    if (facts.est_value != null && p.est_value == null) propPatch.est_value = facts.est_value
    if (facts.purchase_price != null && p.purchase_price == null) propPatch.purchase_price = facts.purchase_price
    if (Object.keys(propPatch).length) await supabase.from('properties').update(propPatch).eq('id', propertyId)

    // Unit-level facts → fill the linked unit's empty columns, if tied to a unit.
    if (d.unit_id) {
      const { data: unitRow } = await supabase
        .from('units')
        .select('sqft, bedrooms, bathrooms, market_rent')
        .eq('id', d.unit_id)
        .maybeSingle()
      const u = (unitRow ?? {}) as { sqft: number | null; bedrooms: number | null; bathrooms: number | null; market_rent: number | null }
      const unitPatch: Record<string, unknown> = {}
      if (facts.sqft != null && u.sqft == null) unitPatch.sqft = facts.sqft
      if (facts.bedrooms != null && u.bedrooms == null) unitPatch.bedrooms = facts.bedrooms
      if (facts.bathrooms != null && u.bathrooms == null) unitPatch.bathrooms = facts.bathrooms
      if (facts.monthly_rent != null && u.market_rent == null) unitPatch.market_rent = facts.monthly_rent
      if (Object.keys(unitPatch).length) await supabase.from('units').update(unitPatch).eq('id', d.unit_id)
    }

    // Book an operating expense if the Overseer identified one (idempotent per
    // document — re-reading replaces the auto-booked row, never manual ones).
    if (facts.is_expense && facts.expense_amount != null && facts.expense_amount > 0) {
      await supabase.from('property_expenses').delete().eq('document_id', d.id).eq('source', 'overseer')
      await supabase.from('property_expenses').insert({
        client_id: d.client_id,
        property_id: propertyId,
        unit_id: d.unit_id,
        document_id: d.id,
        category: normalizeExpenseCategory(facts.expense_category),
        vendor: facts.expense_vendor,
        description: facts.summary,
        amount: facts.expense_amount,
        incurred_on: facts.expense_date || isoDate(),
        source: 'overseer',
      })
      return { ok: true, msg: `The Overseer read the document and booked a ${normalizeExpenseCategory(facts.expense_category)} expense of ${facts.expense_amount}.` }
    }

    return { ok: true, msg: 'The Overseer read the document and filled in what it could.' }
  } catch (e) {
    await supabase
      .from('property_documents')
      .update({ ai_status: 'failed', ai_summary: (e instanceof Error ? e.message : 'parse failed').slice(0, 300) })
      .eq('id', d.id)
    return { ok: false, msg: `The Overseer couldn't read it: ${e instanceof Error ? e.message : 'unknown error'}` }
  }
}

export async function parsePropertyDocument(propertyId: string, docId: string) {
  await requireWorker()
  const supabase = createClient()
  const { data: docRow } = await supabase.from('property_documents').select('*').eq('id', docId).maybeSingle()
  if (!docRow) backToProperty(propertyId, 'Document not found.', 'error')
  const res = await runOverseerParse(supabase, propertyId, docRow as PropertyDocument)
  backToProperty(propertyId, res.msg, res.ok ? 'ok' : 'error')
}

export async function deletePropertyDoc(propertyId: string, docId: string) {
  await requireWorker()
  const supabase = createClient()
  const { data: doc } = await supabase.from('property_documents').select('storage_path').eq('id', docId).maybeSingle()
  if (doc && (doc as { storage_path: string }).storage_path) {
    await supabase.storage.from(DOCS_BUCKET).remove([(doc as { storage_path: string }).storage_path])
  }
  await supabase.from('property_documents').delete().eq('id', docId)
  backToProperty(propertyId, 'Document removed.')
}

// ── Tenant messaging (Phase 4) ──────────────────────────────────────────────
// Email the tenant and log it to the lease's thread. There's no automated
// inbound yet, so received messages are captured with logTenantMessage below.
export async function sendTenantMessage(propertyId: string, leaseId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: leaseRow } = await supabase.from('leases').select('*').eq('id', leaseId).maybeSingle()
  if (!leaseRow) backToProperty(propertyId, 'Lease not found.', 'error')
  const lease = leaseRow as Lease
  if (!lease.tenant_email) backToProperty(propertyId, 'No tenant email on file for this lease.', 'error')

  const subject = str(formData, 'subject') || 'A message from your property manager'
  const body = str(formData, 'body')
  if (!body) backToProperty(propertyId, 'Write a message first.', 'error')

  const [{ data: unit }, { data: property }, { data: client }] = await Promise.all([
    supabase.from('units').select('label').eq('id', lease.unit_id).maybeSingle(),
    supabase.from('properties').select('name').eq('id', lease.property_id).maybeSingle(),
    supabase.from('clients').select('name').eq('id', lease.client_id).maybeSingle(),
  ])

  let status: 'sent' | 'failed' = 'sent'
  try {
    await sendEmail({
      to: lease.tenant_email as string,
      subject,
      html: tenantMessageEmailHtml({
        tenantName: lease.tenant_name,
        landlordName: (client?.name as string) ?? 'Your property manager',
        propertyName: (property?.name as string) ?? 'your rental',
        unitLabel: (unit?.label as string) ?? '',
        subject,
        body,
      }),
    })
  } catch {
    status = 'failed'
  }

  await supabase.from('tenant_messages').insert({
    client_id: lease.client_id,
    lease_id: leaseId,
    property_id: lease.property_id,
    unit_id: lease.unit_id,
    direction: 'outbound',
    channel: 'email',
    subject,
    body,
    to_email: lease.tenant_email,
    sent_by: viewer.userId,
    status,
  })

  if (status === 'failed') backToProperty(propertyId, 'Logged, but the email failed to send.', 'error')
  backToProperty(propertyId, `Message sent to ${lease.tenant_email}.`)
}

// Record a message received from the tenant (phone, text, in person…) so the
// thread reflects both sides until automated inbound exists.
export async function logTenantMessage(propertyId: string, leaseId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: lease } = await supabase.from('leases').select('client_id, property_id, unit_id').eq('id', leaseId).maybeSingle()
  if (!lease) backToProperty(propertyId, 'Lease not found.', 'error')
  const l = lease as { client_id: string; property_id: string; unit_id: string }
  const body = str(formData, 'body')
  if (!body) backToProperty(propertyId, 'Write what the tenant said.', 'error')

  await supabase.from('tenant_messages').insert({
    client_id: l.client_id,
    lease_id: leaseId,
    property_id: l.property_id,
    unit_id: l.unit_id,
    direction: 'inbound',
    channel: 'note',
    subject: null,
    body,
    sent_by: viewer.userId,
    status: 'logged',
  })
  backToProperty(propertyId, 'Logged to the thread.')
}

// ── Rental applications (Phase 3) ───────────────────────────────────────────
// Email a prospect an unguessable public application link.
export async function inviteApplicant(propertyId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: prop } = await supabase.from('properties').select('client_id, name').eq('id', propertyId).maybeSingle()
  if (!prop) backToProperty(propertyId, 'Property not found.', 'error')
  const p = prop as { client_id: string; name: string }

  const email = str(formData, 'email')
  if (!email) backToProperty(propertyId, "Enter the prospect's email.", 'error')
  const unitId = str(formData, 'unit_id') || null

  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const { error } = await supabase.from('rental_applications').insert({
    client_id: p.client_id,
    property_id: propertyId,
    unit_id: unitId,
    token,
    status: 'invited',
    invite_email: email,
    invited_by: viewer.userId,
  })
  if (error) backToProperty(propertyId, error.message, 'error')

  let unitLabel = ''
  if (unitId) {
    const { data: u } = await supabase.from('units').select('label').eq('id', unitId).maybeSingle()
    unitLabel = (u?.label as string) ?? ''
  }
  const { data: client } = await supabase.from('clients').select('name').eq('id', p.client_id).maybeSingle()

  try {
    await sendEmail({
      to: email,
      subject: `Apply to rent ${p.name}`,
      html: applicationInviteEmailHtml({
        landlordName: (client?.name as string) ?? p.name,
        propertyName: p.name,
        unitLabel,
        url: `${siteUrl()}/apply/${token}`,
      }),
    })
  } catch (e) {
    backToProperty(propertyId, `Invite created, but the email failed to send: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
  }
  backToProperty(propertyId, `Application invite sent to ${email}.`)
}

// Approve a submitted application → create the lease + tenant profile from it.
export async function approveApplication(propertyId: string, appId: string) {
  await requireWorker()
  const supabase = createClient()
  const { data: aRow } = await supabase.from('rental_applications').select('*').eq('id', appId).maybeSingle()
  if (!aRow) backToProperty(propertyId, 'Application not found.', 'error')
  const a = aRow as {
    unit_id: string | null
    property_id: string
    client_id: string
    full_name: string | null
    email: string | null
    phone: string | null
    desired_move_in: string | null
    dob: string | null
    current_address: string | null
    employer: string | null
    monthly_income: number | null
    ssn_enc: string | null
    ssn_last4: string | null
    notes: string | null
  }
  if (!a.unit_id) backToProperty(propertyId, 'This application has no unit — re-invite the prospect for a specific unit before approving.', 'error')

  const { data: unit } = await supabase.from('units').select('market_rent').eq('id', a.unit_id).maybeSingle()
  const marketRent = (unit?.market_rent as number | null) ?? 0

  const { data: lease, error: lErr } = await supabase
    .from('leases')
    .insert({
      unit_id: a.unit_id,
      property_id: a.property_id,
      client_id: a.client_id,
      tenant_name: a.full_name ?? 'New tenant',
      tenant_email: a.email ?? null,
      tenant_phone: a.phone ?? null,
      rent_amount: marketRent,
      rent_due_day: 1,
      start_date: a.desired_move_in ?? null,
      status: 'active',
    })
    .select('id')
    .single()
  if (lErr || !lease) backToProperty(propertyId, lErr?.message ?? 'Could not create the lease.', 'error')

  // Carry the applicant's details into a tenant profile (SSN already encrypted).
  await supabase.from('tenant_profiles').upsert(
    {
      client_id: a.client_id,
      lease_id: lease.id,
      dob: a.dob ?? null,
      current_address: a.current_address ?? null,
      employer: a.employer ?? null,
      monthly_income: a.monthly_income ?? null,
      ssn_enc: a.ssn_enc ?? null,
      ssn_last4: a.ssn_last4 ?? null,
      notes: a.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lease_id' }
  )

  await supabase.from('rental_applications').update({ status: 'approved' }).eq('id', appId)
  backToProperty(propertyId, `Approved — ${a.full_name ?? 'the applicant'} is now a tenant. Set the rent/lease terms on the unit if needed.`)
}

export async function declineApplication(propertyId: string, appId: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('rental_applications').update({ status: 'declined' }).eq('id', appId)
  backToProperty(propertyId, 'Application declined.')
}

// ── Per-property collaborators (third-party managers) ───────────────────────

function collabInviteHtml(o: { propertyName: string; ownerName: string; role: string; url: string }): string {
  const roleWord = o.role === 'viewer' ? 'view' : 'help manage'
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px">
      <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin:0 0 6px">Rovelo Inc · Property management</p>
      <h1 style="font-size:20px;margin:0 0 12px">You've been invited to ${roleWord} a property</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 8px">
        ${o.ownerName ? `${o.ownerName} has` : 'You have been'} invited you to ${roleWord} <strong>${o.propertyName}</strong> in the Rovelo Inc property system.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 20px">Click below to accept and open the property. You'll sign in (or create an account) with this email address.</p>
      <a href="${o.url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">Accept invitation</a>
      <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">Or paste this link into your browser:<br>${o.url}</p>
    </div>
  </div></body></html>`
}

// Invite a third-party manager to ONE property. RLS on property_access ensures
// only owner/manager-level users can add collaborators.
export async function inviteCollaborator(propertyId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: prop } = await supabase.from('properties').select('client_id, name').eq('id', propertyId).maybeSingle()
  if (!prop) backToProperty(propertyId, 'Property not found.', 'error')
  const p = prop as { client_id: string; name: string }

  const email = str(formData, 'email').trim().toLowerCase()
  if (!email || !email.includes('@')) backToProperty(propertyId, "Enter the collaborator's email.", 'error')
  const name = str(formData, 'name') || null
  const role = str(formData, 'role') === 'viewer' ? 'viewer' : 'manager'

  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const { error } = await supabase.from('property_access').insert({
    property_id: propertyId,
    client_id: p.client_id,
    email,
    name,
    role,
    status: 'invited',
    token,
    invited_by: viewer.userId,
  })
  if (error) {
    backToProperty(
      propertyId,
      /duplicate|unique/i.test(error.message) ? 'That email is already a collaborator on this property.' : error.message,
      'error'
    )
  }

  const acceptUrl = `${siteUrl()}/collab/${token}`
  const { data: client } = await supabase.from('clients').select('name').eq('id', p.client_id).maybeSingle()
  const ownerName = (client?.name as string) ?? p.name

  // Best-effort: create a Supabase account for a brand-new manager (requires the
  // project's Auth "Invite" email). Ignored if they already have an account.
  try {
    const admin = createAdminClient()
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo: acceptUrl })
  } catch {
    /* ignore — the Resend email below carries the accept link regardless */
  }

  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to manage ${p.name}`,
      html: collabInviteHtml({ propertyName: p.name, ownerName, role, url: acceptUrl }),
    })
  } catch {
    backToProperty(propertyId, `Collaborator added, but the invite email failed. Link: ${acceptUrl}`, 'error')
  }
  backToProperty(propertyId, `Invited ${email} to ${role === 'viewer' ? 'view' : 'manage'} this property.`)
}

// Revoke a collaborator's access (keeps the row as an audit trail).
export async function removeCollaborator(propertyId: string, accessId: string) {
  await requireWorker()
  const supabase = createClient()
  const { error } = await supabase.from('property_access').update({ status: 'removed' }).eq('id', accessId).eq('property_id', propertyId)
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Collaborator removed.')
}

// Re-send a pending invite email.
export async function resendCollaborator(propertyId: string, accessId: string) {
  await requireWorker()
  const supabase = createClient()
  const { data: row } = await supabase.from('property_access').select('email, token, status').eq('id', accessId).eq('property_id', propertyId).maybeSingle()
  if (!row) backToProperty(propertyId, 'Collaborator not found.', 'error')
  const r = row as { email: string; token: string; status: string }
  if (r.status !== 'invited') backToProperty(propertyId, 'This collaborator has already accepted.', 'error')

  const { data: prop } = await supabase.from('properties').select('name, client_id').eq('id', propertyId).maybeSingle()
  const pn = (prop?.name as string) ?? 'the property'
  const { data: client } = await supabase.from('clients').select('name').eq('id', prop?.client_id as string).maybeSingle()
  const acceptUrl = `${siteUrl()}/collab/${r.token}`
  try {
    await sendEmail({
      to: r.email,
      subject: `Reminder: manage ${pn}`,
      html: collabInviteHtml({ propertyName: pn, ownerName: (client?.name as string) ?? pn, role: 'manager', url: acceptUrl }),
    })
  } catch {
    backToProperty(propertyId, `Could not resend. Link: ${acceptUrl}`, 'error')
  }
  backToProperty(propertyId, `Invite re-sent to ${r.email}.`)
}

// ── Property operating expenses (P&L) ───────────────────────────────────────
export async function addExpense(propertyId: string, formData: FormData) {
  const viewer = await requireWorker()
  const supabase = createClient()
  const { data: prop } = await supabase.from('properties').select('client_id').eq('id', propertyId).maybeSingle()
  if (!prop) backToProperty(propertyId, 'Property not found.', 'error')
  const clientId = (prop as { client_id: string }).client_id

  const amount = num(formData, 'amount') ?? 0
  if (amount <= 0) backToProperty(propertyId, 'Enter an expense amount greater than zero.', 'error')

  const { error } = await supabase.from('property_expenses').insert({
    client_id: clientId,
    property_id: propertyId,
    unit_id: str(formData, 'unit_id') || null,
    category: normalizeExpenseCategory(str(formData, 'category')),
    vendor: str(formData, 'vendor') || null,
    description: str(formData, 'description') || null,
    amount,
    incurred_on: str(formData, 'incurred_on') || isoDate(),
    source: 'manual',
    created_by: viewer.userId,
  })
  if (error) backToProperty(propertyId, error.message, 'error')
  backToProperty(propertyId, 'Expense added.')
}

export async function deleteExpense(propertyId: string, expenseId: string) {
  await requireWorker()
  const supabase = createClient()
  await supabase.from('property_expenses').delete().eq('id', expenseId).eq('property_id', propertyId)
  backToProperty(propertyId, 'Expense removed.')
}

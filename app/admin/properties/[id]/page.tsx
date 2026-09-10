import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PropertyImage from '@/components/PropertyImage'
import { getViewer } from '@/lib/auth'
import { getProperty, computeStats, activeLeaseFor } from '@/lib/propertyServer'
import {
  PROPERTY_TYPE_LABELS,
  CHARGE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  usd,
  monthLabel,
  monthLabelShort,
  fmtDate,
  firstOfMonth,
  effectiveChargeStatus,
  paymentInstructions,
  type Property,
  type PropertyType,
  type ChargeStatus,
  type Lease,
  type Unit,
  type RentCharge,
  type RentPayment,
  type PaymentMethod,
} from '@/lib/property'
import {
  addUnit,
  createLease,
  generateRentSchedule,
  recordPayment,
  sendRentInvoice,
  waiveCharge,
  endLease,
  updatePaymentSettings,
} from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'
const btnPrimary = 'rounded-lg bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors'
const btnQuiet = 'text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors'
const summaryCls = 'cursor-pointer text-[13px] font-medium text-gray-700 hover:text-gray-900 select-none'

const STATUS_STYLE: Record<ChargeStatus, string> = {
  paid: 'text-green-700 bg-green-50 border-green-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  due: 'text-gray-600 bg-gray-50 border-gray-200',
  overdue: 'text-red-700 bg-red-50 border-red-200',
  waived: 'text-gray-400 bg-gray-50 border-gray-200',
}

export default async function ManageProperty({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { ok?: string; error?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  const canManage = viewer?.role === 'admin' || viewer?.role === 'collaborator'

  const detail = await getProperty(supabase, params.id)
  if (!detail) notFound()
  const { property, units, leases, charges, payments } = detail

  const month = firstOfMonth()
  const monthCharges = charges.filter((c) => c.period_month.slice(0, 10) === month)
  const stats = computeStats(units, leases, monthCharges)

  // Charges grouped by lease, newest month first.
  const chargesByLease = new Map<string, RentCharge[]>()
  for (const c of charges) {
    const arr = chargesByLease.get(c.lease_id) ?? []
    arr.push(c)
    chargesByLease.set(c.lease_id, arr)
  }
  // Payments grouped by charge, for receipt numbers in the tracker.
  const paymentsByCharge = new Map<string, RentPayment[]>()
  for (const p of payments) {
    const arr = paymentsByCharge.get(p.charge_id) ?? []
    arr.push(p)
    paymentsByCharge.set(p.charge_id, arr)
  }

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Properties" email={user?.email} settingsHref={null} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/admin/properties" className="text-xs text-gray-500 hover:text-gray-900">
          ← Properties
        </Link>

        {searchParams.ok && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{searchParams.ok}</div>
        )}
        {searchParams.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
        )}

        {/* Header */}
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
                {property.name}
              </h1>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">
                {PROPERTY_TYPE_LABELS[property.type as PropertyType] ?? property.type}
              </span>
            </div>
            {property.address && <p className="text-sm text-gray-600 mt-0.5">{property.address}</p>}
          </div>
          <p className="text-xs text-gray-400 whitespace-nowrap pt-2">{monthLabel(month)}</p>
        </div>

        {/* Auto photo (Street View → satellite fallback) */}
        <PropertyImage
          lat={property.lat}
          lng={property.lng}
          name={property.name}
          size="800x300"
          className="mt-4 w-full h-44 object-cover rounded-xl border border-gray-100"
        />

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Units" value={`${stats.occupied}/${stats.units}`} sub="occupied" />
          <Stat label="Rent roll" value={usd(stats.monthlyRent)} sub="per month" />
          <Stat label="Collected" value={usd(stats.collectedThisMonth)} sub={`of ${usd(stats.dueThisMonth)} due`} />
          <Stat label="Outstanding" value={usd(stats.outstanding)} tone={stats.outstanding > 0 ? 'warn' : 'ok'} sub="this month" />
        </div>

        {/* Payment instructions + reminders */}
        {canManage && <PaymentSettings property={property} />}

        {/* Units */}
        <div className="mt-8">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Units &amp; tenants</h2>

          {units.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">No units yet. Add the first one below.</p>
          ) : (
            <div className="space-y-4">
              {units.map((unit) => {
                const lease = activeLeaseFor(unit.id, leases)
                const leaseCharges = lease ? (chargesByLease.get(lease.id) ?? []) : []
                return (
                  <div key={unit.id} className="rounded-xl border border-gray-200 p-4">
                    <UnitHeader unit={unit} lease={lease} />
                    {lease ? (
                      <LeaseBlock
                        propertyId={property.id}
                        lease={lease}
                        charges={leaseCharges}
                        paymentsByCharge={paymentsByCharge}
                        canManage={canManage}
                      />
                    ) : (
                      canManage && <AddTenantForm propertyId={property.id} unit={unit} />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add unit */}
          {canManage && (
            <details className="mt-4 rounded-xl border border-dashed border-gray-200 p-4">
              <summary className={summaryCls}>+ Add a unit</summary>
              <form action={addUnit.bind(null, property.id)} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={label} htmlFor="label">Label</label>
                  <input id="label" name="label" placeholder="A" className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="bedrooms">Beds</label>
                  <input id="bedrooms" name="bedrooms" inputMode="decimal" placeholder="2" className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="bathrooms">Baths</label>
                  <input id="bathrooms" name="bathrooms" inputMode="decimal" placeholder="1" className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="market_rent">Market rent</label>
                  <input id="market_rent" name="market_rent" inputMode="decimal" placeholder="1800" className={input} />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <button type="submit" className={btnPrimary}>Add unit</button>
                </div>
              </form>
            </details>
          )}
        </div>
      </main>
    </div>
  )
}

function Stat({ label: l, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{l}</p>
      <p className={`text-lg font-semibold tabular-nums mt-1 ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function UnitHeader({ unit, lease }: { unit: Unit; lease: Lease | null }) {
  const specs = [
    unit.bedrooms != null ? `${unit.bedrooms} bd` : null,
    unit.bathrooms != null ? `${unit.bathrooms} ba` : null,
    unit.sqft != null ? `${unit.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{unit.label}</p>
        {specs && <p className="text-xs text-gray-500 mt-0.5">{specs}</p>}
      </div>
      <div className="text-right">
        {lease ? (
          <>
            <p className="text-sm text-gray-900">{lease.tenant_name}</p>
            <p className="text-[11px] text-green-600">{usd(lease.rent_amount)}/mo · occupied</p>
          </>
        ) : (
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Vacant</p>
        )}
      </div>
    </div>
  )
}

function LeaseBlock({
  propertyId,
  lease,
  charges,
  paymentsByCharge,
  canManage,
}: {
  propertyId: string
  lease: Lease
  charges: RentCharge[]
  paymentsByCharge: Map<string, RentPayment[]>
  canManage: boolean
}) {
  const recent = charges.slice(0, 12)
  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {lease.tenant_email ?? 'no email on file'}
          {lease.tenant_phone ? ` · ${lease.tenant_phone}` : ''}
          {lease.start_date ? ` · since ${fmtDate(lease.start_date)}` : ''}
        </p>
        {canManage && (
          <form action={endLease.bind(null, propertyId, lease.id)}>
            <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600 transition-colors">End lease</button>
          </form>
        )}
      </div>

      {/* Rent tracker */}
      {recent.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">No rent scheduled yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-3 font-medium">Month</th>
                <th className="py-1.5 pr-3 font-medium">Due</th>
                <th className="py-1.5 pr-3 font-medium">Paid</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                {canManage && <th className="py-1.5 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => {
                const eff = effectiveChargeStatus(c)
                return (
                  <tr key={c.id} className="border-t border-gray-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-900">
                      {monthLabelShort(c.period_month)}
                      <span className="block text-[10px] text-gray-400 tabular-nums">{c.invoice_number}</span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-gray-700">{usd(c.amount_due)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-gray-700">
                      {usd(c.amount_paid)}
                      {c.paid_date && <span className="block text-[10px] text-gray-400">{fmtDate(c.paid_date)}</span>}
                      {(paymentsByCharge.get(c.id) ?? []).map((p) => (
                        <span key={p.id} className="block text-[10px] text-gray-400 tabular-nums">{p.receipt_number}</span>
                      ))}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block text-[10px] font-medium border rounded-full px-2 py-0.5 ${STATUS_STYLE[eff]}`}>
                        {CHARGE_STATUS_LABELS[eff]}
                      </span>
                    </td>
                    {canManage && (
                      <td className="py-2 text-right">
                        {eff !== 'paid' && eff !== 'waived' ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <RecordPaymentForm propertyId={propertyId} charge={c} />
                            <div className="flex items-center gap-2">
                              {lease.tenant_email && (
                                <form action={sendRentInvoice.bind(null, propertyId, c.id)}>
                                  <button type="submit" className="text-[11px] text-gray-500 hover:text-gray-900">Send invoice</button>
                                </form>
                              )}
                              <form action={waiveCharge.bind(null, propertyId, c.id)}>
                                <button type="submit" className="text-[11px] text-gray-400 hover:text-gray-700">Waive</button>
                              </form>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule rent */}
      {canManage && (
        <details className="mt-3">
          <summary className={summaryCls}>Schedule rent</summary>
          <form action={generateRentSchedule.bind(null, propertyId, lease.id)} className="mt-2 flex flex-wrap items-end gap-3">
            <div>
              <label className={label} htmlFor={`start_month_${lease.id}`}>Starting</label>
              <input id={`start_month_${lease.id}`} name="start_month" type="date" defaultValue={firstOfMonth()} className={input} />
            </div>
            <div>
              <label className={label} htmlFor={`months_${lease.id}`}>Months</label>
              <input id={`months_${lease.id}`} name="months" inputMode="numeric" defaultValue="12" className={`${input} w-20`} />
            </div>
            <button type="submit" className={btnPrimary}>Generate</button>
            <span className="text-[11px] text-gray-400">Creates one rent line per month at {usd(lease.rent_amount)}, due day {lease.rent_due_day}.</span>
          </form>
        </details>
      )}
    </div>
  )
}

function RecordPaymentForm({ propertyId, charge }: { propertyId: string; charge: RentCharge }) {
  const owed = Math.max(Number(charge.amount_due) - Number(charge.amount_paid), 0)
  return (
    <details>
      <summary className="cursor-pointer text-[11px] font-medium text-gray-700 hover:text-gray-900 select-none">Record payment</summary>
      <form
        action={recordPayment.bind(null, propertyId, charge.id)}
        className="mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm space-y-2"
      >
        <div>
          <label className={label} htmlFor={`amount_${charge.id}`}>Amount</label>
          <input id={`amount_${charge.id}`} name="amount" inputMode="decimal" defaultValue={owed ? String(owed) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`paid_date_${charge.id}`}>Date</label>
          <input id={`paid_date_${charge.id}`} name="paid_date" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`method_${charge.id}`}>Method</label>
          <select id={`method_${charge.id}`} name="method" className={input} defaultValue="">
            <option value="">—</option>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((k) => (
              <option key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`reference_${charge.id}`}>Reference</label>
          <input id={`reference_${charge.id}`} name="reference" placeholder="Check #, memo…" className={input} />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" name="send_receipt" defaultChecked className="rounded border-gray-300" /> Email receipt to tenant
        </label>
        <p className="text-[10px] text-gray-400 -mt-1">Sent automatically on save (uncheck to skip). Needs a tenant email on the lease.</p>
        <button type="submit" className={`${btnPrimary} w-full`}>Save payment</button>
      </form>
    </details>
  )
}

function PaymentSettings({ property }: { property: Property }) {
  const set = paymentInstructions(property)
  const summary = set.length ? set.map((s) => s.label).join(' · ') : 'No payment methods set'
  return (
    <details className="mt-4 rounded-xl border border-gray-200 p-4">
      <summary className="cursor-pointer select-none flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-gray-700">How tenants pay &amp; reminders</span>
        <span className="text-[11px] text-gray-400">
          {summary} · reminders {property.auto_reminders ? 'on' : 'off'}
        </span>
      </summary>
      <form action={updatePaymentSettings.bind(null, property.id)} className="mt-4 space-y-3">
        <p className="text-xs text-gray-500">
          These appear on rent invoices, reminders, and receipts. Fill in whichever apply.
        </p>
        <div>
          <label className={label} htmlFor="pay_zelle">Zelle</label>
          <input id="pay_zelle" name="pay_zelle" defaultValue={property.pay_zelle ?? ''} placeholder="rent@landlord.com or (619) 555-0100" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="pay_bank">Bank deposit / ACH</label>
          <textarea id="pay_bank" name="pay_bank" rows={2} defaultValue={property.pay_bank ?? ''} placeholder="Bank, routing & account, or Plaid link…" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="pay_check">Check</label>
          <textarea id="pay_check" name="pay_check" rows={2} defaultValue={property.pay_check ?? ''} placeholder="Payable to … · mail to …" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="pay_other">Other</label>
          <input id="pay_other" name="pay_other" defaultValue={property.pay_other ?? ''} placeholder="Cash at office, portal, etc." className={input} />
        </div>
        <div className="flex flex-wrap items-end gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="auto_reminders" defaultChecked={property.auto_reminders} className="rounded border-gray-300" />
            Send automated reminders
          </label>
          <div>
            <label className={label} htmlFor="reminder_lead_days">Days before due</label>
            <input id="reminder_lead_days" name="reminder_lead_days" inputMode="numeric" defaultValue={String(property.reminder_lead_days ?? 5)} className={`${input} w-20`} />
          </div>
        </div>
        <div className="pt-1">
          <button type="submit" className={btnPrimary}>Save</button>
        </div>
      </form>
    </details>
  )
}

function AddTenantForm({ propertyId, unit }: { propertyId: string; unit: Unit }) {
  return (
    <details className="mt-3 border-t border-gray-100 pt-3">
      <summary className={summaryCls}>+ Add tenant</summary>
      <form action={createLease.bind(null, propertyId)} className="mt-3 grid grid-cols-2 gap-3">
        <input type="hidden" name="unit_id" value={unit.id} />
        <div className="col-span-2">
          <label className={label} htmlFor={`tenant_name_${unit.id}`}>Tenant name</label>
          <input id={`tenant_name_${unit.id}`} name="tenant_name" required placeholder="Jane Doe" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`tenant_email_${unit.id}`}>Email</label>
          <input id={`tenant_email_${unit.id}`} name="tenant_email" type="email" placeholder="jane@email.com" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`tenant_phone_${unit.id}`}>Phone</label>
          <input id={`tenant_phone_${unit.id}`} name="tenant_phone" placeholder="(619) 555-0100" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`rent_amount_${unit.id}`}>Monthly rent</label>
          <input id={`rent_amount_${unit.id}`} name="rent_amount" inputMode="decimal" defaultValue={unit.market_rent ? String(unit.market_rent) : ''} placeholder="1800" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`deposit_amount_${unit.id}`}>Deposit</label>
          <input id={`deposit_amount_${unit.id}`} name="deposit_amount" inputMode="decimal" placeholder="1800" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`rent_due_day_${unit.id}`}>Rent due day</label>
          <input id={`rent_due_day_${unit.id}`} name="rent_due_day" inputMode="numeric" defaultValue="1" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`start_date_${unit.id}`}>Lease start</label>
          <input id={`start_date_${unit.id}`} name="start_date" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`end_date_${unit.id}`}>Lease end</label>
          <input id={`end_date_${unit.id}`} name="end_date" type="date" className={input} />
        </div>
        <div className="col-span-2">
          <button type="submit" className={btnPrimary}>Add tenant</button>
        </div>
      </form>
    </details>
  )
}

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import PropertyImage from '@/components/PropertyImage'
import PropertyTabs from '@/components/PropertyTabs'
import DocumentsShelf from '@/components/DocumentsShelf'
import SettingsSidebar from '@/components/SettingsSidebar'
import FinancesPanel from '@/components/FinancesPanel'
import PropertyAddressInput from '@/components/PropertyAddressInput'
import DocUploadModal from '@/components/DocUploadModal'
import { getViewer } from '@/lib/auth'
import { canUsePropertyModule } from '@/lib/propertyAccess'
import { getProperty, computeStats, activeLeaseFor, type PropertyDocWithUrl } from '@/lib/propertyServer'
import {
  PROPERTY_TYPE_LABELS,
  CHARGE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  DOC_KIND_LABELS,
  ID_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  SCREENING_QUESTIONS,
  maskSsn,
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
  type TenantProfile,
  type TenantMessage,
  type RentalApplication,
  type Collaborator,
  COLLABORATOR_ROLE_LABELS,
  COLLABORATOR_STATUS_LABELS,
  type IdType,
} from '@/lib/property'
import {
  addUnit,
  updateUnit,
  deleteUnit,
  createLease,
  generateRentSchedule,
  recordPayment,
  sendRentInvoice,
  waiveCharge,
  endLease,
  updatePaymentSettings,
  updateProperty,
  archiveProperty,
  saveTenantProfile,
  uploadPropertyDoc,
  parsePropertyDocument,
  deletePropertyDoc,
  arrangePhoto,
  inviteCollaborator,
  removeCollaborator,
  resendCollaborator,
  addExpense,
  deleteExpense,
  sendTenantMessage,
  logTenantMessage,
  inviteApplicant,
  approveApplication,
  declineApplication,
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
  if (!(await canUsePropertyModule(viewer))) redirect('/admin')
  const canManage = viewer?.role === 'admin' || viewer?.role === 'collaborator'

  const detail = await getProperty(supabase, params.id)
  if (!detail) notFound()
  const { property, units, leases, charges, payments, tenantProfiles, documents, messages, applications, collaborators, expenses } = detail
  const profileByLease = new Map(tenantProfiles.map((p) => [p.lease_id, p]))
  const host = headers().get('host') ?? ''
  const baseUrl = host ? `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}` : ''
  const messagesByLease = new Map<string, TenantMessage[]>()
  for (const m of messages) {
    const arr = messagesByLease.get(m.lease_id) ?? []
    arr.push(m)
    messagesByLease.set(m.lease_id, arr)
  }

  const month = firstOfMonth()
  const monthCharges = charges.filter((c) => c.period_month.slice(0, 10) === month)
  const stats = computeStats(units, leases, monthCharges)

  // Listing-style metrics.
  const totalSqft = units.reduce((s, u) => s + (Number(u.sqft) || 0), 0)
  const marketRentTotal = units.reduce((s, u) => s + (Number(u.market_rent) || 0), 0)
  const pricePerSqft = property.est_value && totalSqft ? property.est_value / totalSqft : null
  const grossYield = property.est_value && marketRentTotal ? (marketRentTotal * 12) / property.est_value : null
  const photos = documents.filter((d) => d.doc_kind === 'photo' && !!d.url)
  // Documents tab shows real documents only — photos live in the Gallery.
  const docFiles = documents.filter((d) => d.doc_kind !== 'photo')

  // Charges grouped by lease, newest month first.
  const chargesByLease = new Map<string, RentCharge[]>()
  for (const c of charges) {
    const arr = chargesByLease.get(c.lease_id) ?? []
    arr.push(c)
    chargesByLease.set(c.lease_id, arr)
  }
  // Payments grouped by charge, for receipt numbers in the tracker.
  const paymentsByCharge = new Map<string, RentPayment[]>()
  // Payments grouped by lease, newest first, for the Payments-tab history ledger.
  const paymentsByLease = new Map<string, RentPayment[]>()
  for (const p of payments) {
    const arr = paymentsByCharge.get(p.charge_id) ?? []
    arr.push(p)
    paymentsByCharge.set(p.charge_id, arr)
    const larr = paymentsByLease.get(p.lease_id) ?? []
    larr.push(p)
    paymentsByLease.set(p.lease_id, larr)
  }

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Property Management" email={user?.email} settingsHref={null} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <PropertyTabs
          propertyId={property.id}
          breadcrumb={
            <Link href="/admin/properties" className="text-xs text-gray-500 hover:text-gray-900">
              ← Properties
            </Link>
          }
          notice={
            <>
              {searchParams.ok && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{searchParams.ok}</div>
              )}
              {searchParams.error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
              )}
            </>
          }
          header={
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
                {(property.year_built || property.lot_size || property.parcel_number) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {[
                      property.year_built ? `Built ${property.year_built}` : null,
                      property.lot_size,
                      property.parcel_number ? `APN ${property.parcel_number}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-400 whitespace-nowrap pt-2">{monthLabel(month)}</p>
            </div>
          }
          photos={photos.map((p) => ({ id: p.id, url: p.url ?? '', name: p.name }))}
          canManagePhotos={canManage}
          arrangePhoto={arrangePhoto}
          deletePhoto={canManage ? deletePropertyDoc : undefined}
          documentsCount={docFiles.length}
          uploadPhoto={canManage ? uploadPropertyDoc.bind(null, property.id) : undefined}
          applicationsCount={applications.length}
          fallback={
            <PropertyImage
              lat={property.lat}
              lng={property.lng}
              address={property.address}
              name={property.name}
              size="800x300"
              className="w-full h-40 object-cover rounded-xl border border-gray-100"
            />
          }
          documents={<DocumentsSection propertyId={property.id} units={units} documents={docFiles} canManage={canManage} />}
          applications={<ApplicationsSection propertyId={property.id} units={units} applications={applications} baseUrl={baseUrl} canManage={canManage} />}
          payments={
            canManage ? (
              <PaymentsPanel
                propertyId={property.id}
                property={property}
                units={units}
                leases={leases}
                chargesByLease={chargesByLease}
                paymentsByCharge={paymentsByCharge}
                paymentsByLease={paymentsByLease}
                canManage={canManage}
              />
            ) : undefined
          }
          finances={
            canManage ? (
              <FinancesPanel
                propertyId={property.id}
                income={payments.map((p) => ({ id: p.id, amount: p.amount, date: p.paid_date, unitId: p.unit_id }))}
                expenses={expenses}
                units={units.map((u) => ({ id: u.id, label: u.label }))}
                canManage={canManage}
                addExpense={addExpense}
                deleteExpense={deleteExpense}
              />
            ) : undefined
          }
          settings={canManage ? <SettingsSection property={property} collaborators={collaborators} /> : undefined}
          overview={
          <>
        {/* Stats — one compact strip */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-gray-200 px-4 py-3">
          <Stat label="Units" value={`${stats.occupied}/${stats.units}`} sub="occ." />
          <Stat label="Rent roll" value={usd(stats.monthlyRent)} sub="/mo" />
          <Stat label="Collected" value={usd(stats.collectedThisMonth)} sub={`/ ${usd(stats.dueThisMonth)}`} />
          <Stat label="Outstanding" value={usd(stats.outstanding)} tone={stats.outstanding > 0 ? 'warn' : undefined} />
        </div>

        {/* Valuation / listing metrics */}
        {(property.est_value != null || property.purchase_price != null || marketRentTotal > 0) && (
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-gray-200 px-4 py-3">
            {property.est_value != null && <Stat label="Est. value" value={usd(property.est_value)} />}
            {pricePerSqft != null && <Stat label="$/sqft" value={usd(pricePerSqft)} />}
            {grossYield != null && <Stat label="Gross yield" value={`${(grossYield * 100).toFixed(1)}%`} />}
            {marketRentTotal > 0 && <Stat label="Market rent" value={usd(marketRentTotal)} sub="/mo" />}
            {property.purchase_price != null && (
              <Stat label="Purchased" value={usd(property.purchase_price)} sub={property.purchase_date ? fmtDate(property.purchase_date) : undefined} />
            )}
          </div>
        )}

        {/* Units */}
        <div className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {property.multi_unit ? 'Units & tenants' : 'Home & tenant'}
            </h2>
            {!property.multi_unit && units.length > 0 && (
              <span className="text-[10px] text-gray-400">Single-family · manages one home</span>
            )}
          </div>

          {units.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">
              {property.multi_unit ? 'No units yet. Add the first one below.' : 'Set up the home below to start tracking rent and its tenant.'}
            </p>
          ) : (
            <div className="space-y-4">
              {units.map((unit) => {
                const lease = activeLeaseFor(unit.id, leases)
                return (
                  <div key={unit.id} className="rounded-xl border border-gray-200 p-4">
                    <UnitHeader unit={unit} lease={lease} hideLabel={!property.multi_unit} />
                    {lease ? (
                      <LeaseBlock
                        propertyId={property.id}
                        lease={lease}
                        profile={profileByLease.get(lease.id) ?? null}
                        messages={messagesByLease.get(lease.id) ?? []}
                        canManage={canManage}
                      />
                    ) : (
                      canManage && <AddTenantForm propertyId={property.id} unit={unit} />
                    )}
                    {canManage && <EditUnit propertyId={property.id} unit={unit} hasLease={!!lease} single={!property.multi_unit} />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add unit — multi-family adds more; single-family only until its home exists */}
          {canManage && (property.multi_unit || units.length === 0) && (
            <details className="mt-4 rounded-xl border border-dashed border-gray-200 p-4">
              <summary className={summaryCls}>{property.multi_unit ? '+ Add a unit' : '+ Set up the home'}</summary>
              <form action={addUnit.bind(null, property.id)} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={label} htmlFor="label">Label</label>
                  <input id="label" name="label" placeholder={property.multi_unit ? 'A' : 'Home'} defaultValue={property.multi_unit ? '' : 'Home'} className={input} />
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
                  <label className={label} htmlFor="sqft">Sqft</label>
                  <input id="sqft" name="sqft" inputMode="numeric" placeholder="650" className={input} />
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

          </>
          }
        />
      </main>
    </div>
  )
}

function Stat({ label: l, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{l}</p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
        {sub && <span className="text-gray-400 font-normal"> {sub}</span>}
      </p>
    </div>
  )
}

function UnitHeader({ unit, lease, hideLabel }: { unit: Unit; lease: Lease | null; hideLabel?: boolean }) {
  const rentPerSqft = unit.market_rent != null && unit.sqft ? unit.market_rent / unit.sqft : null
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {!hideLabel && <p className="text-sm font-semibold text-gray-900">{unit.label}</p>}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 ${hideLabel ? '' : 'mt-1'}`}>
          {unit.bedrooms != null && <span><span className="font-semibold text-gray-900">{unit.bedrooms}</span> bd</span>}
          {unit.bathrooms != null && <span><span className="font-semibold text-gray-900">{unit.bathrooms}</span> ba</span>}
          {unit.sqft != null && <span><span className="font-semibold text-gray-900">{unit.sqft.toLocaleString()}</span> sqft</span>}
          {unit.market_rent != null && <span><span className="font-semibold text-gray-900">{usd(unit.market_rent)}</span>/mo</span>}
          {rentPerSqft != null && <span className="text-gray-400">${rentPerSqft.toFixed(2)}/sqft</span>}
        </div>
        {unit.notes && <p className="text-[11px] text-gray-400 mt-0.5">{unit.notes}</p>}
      </div>
      <div className="text-right shrink-0">
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
  profile,
  messages,
  canManage,
}: {
  propertyId: string
  lease: Lease
  profile: TenantProfile | null
  messages: TenantMessage[]
  canManage: boolean
}) {
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

      {canManage && <TenantProfileForm propertyId={propertyId} lease={lease} profile={profile} />}
      {canManage && <MessagesThread propertyId={propertyId} lease={lease} messages={messages} />}

      <p className="mt-3 text-[11px] text-gray-400">
        Rent, payments &amp; history live in the <span className="font-medium text-gray-500">Payments</span> tab.
      </p>
    </div>
  )
}

// The rent schedule/tracker for one lease — every month's charge with record-payment,
// send-invoice and waive actions.
function RentTracker({
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
  if (recent.length === 0) return <p className="mt-3 text-xs text-gray-500">No rent scheduled yet — use “Schedule rent” below.</p>
  return (
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
  )
}

// Chronological ledger of recorded payments for one lease.
function PaymentHistory({ payments, monthByCharge }: { payments: RentPayment[]; monthByCharge: Map<string, string> }) {
  if (payments.length === 0) return null
  return (
    <div className="mt-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Payment history</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-1.5 pr-3 font-medium">Date</th>
              <th className="py-1.5 pr-3 font-medium">Amount</th>
              <th className="py-1.5 pr-3 font-medium">Method</th>
              <th className="py-1.5 pr-3 font-medium">For</th>
              <th className="py-1.5 font-medium">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-2 pr-3 whitespace-nowrap text-gray-900">{fmtDate(p.paid_date)}</td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-green-700">{usd(p.amount)}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                  {p.method ? ((PAYMENT_METHOD_LABELS as Record<string, string>)[p.method] ?? p.method) : '—'}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                  {monthByCharge.get(p.charge_id) ? monthLabelShort(monthByCharge.get(p.charge_id)!) : '—'}
                </td>
                <td className="py-2 whitespace-nowrap tabular-nums text-gray-400">{p.receipt_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScheduleRent({ propertyId, lease }: { propertyId: string; lease: Lease }) {
  return (
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
  )
}

// Payments tab: the money hub — per active tenant, payment health + rent tracker +
// payment history + schedule, then the "how tenants pay" settings.
function PaymentsPanel({
  propertyId,
  property,
  units,
  leases,
  chargesByLease,
  paymentsByCharge,
  paymentsByLease,
  canManage,
}: {
  propertyId: string
  property: Property
  units: Unit[]
  leases: Lease[]
  chargesByLease: Map<string, RentCharge[]>
  paymentsByCharge: Map<string, RentPayment[]>
  paymentsByLease: Map<string, RentPayment[]>
  canManage: boolean
}) {
  const tenants = units
    .map((unit) => ({ unit, lease: activeLeaseFor(unit.id, leases) }))
    .filter((x): x is { unit: Unit; lease: Lease } => !!x.lease)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
        <p className="mt-0.5 text-xs text-gray-400">Record rent, track balances, and review each tenant&apos;s history.</p>
      </div>

      {tenants.length === 0 ? (
        <p className="text-sm text-gray-500">No active tenants yet. Add a tenant from the Overview tab to start tracking rent.</p>
      ) : (
        tenants.map(({ unit, lease }) => {
          const charges = chargesByLease.get(lease.id) ?? []
          const pays = paymentsByLease.get(lease.id) ?? []
          const monthByCharge = new Map(charges.map((c) => [c.id, c.period_month]))
          return (
            <div key={lease.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{lease.tenant_name}</p>
                  <p className="text-[11px] text-gray-400">
                    {property.multi_unit ? `${unit.label} · ` : ''}
                    {usd(lease.rent_amount)}/mo · due day {lease.rent_due_day}
                  </p>
                </div>
              </div>

              <PaymentHealth charges={charges} paymentsByCharge={paymentsByCharge} />
              <RentTracker propertyId={propertyId} lease={lease} charges={charges} paymentsByCharge={paymentsByCharge} canManage={canManage} />
              <PaymentHistory payments={pays} monthByCharge={monthByCharge} />
              {canManage && <ScheduleRent propertyId={propertyId} lease={lease} />}
            </div>
          )
        })
      )}

      {canManage && <PaymentSettings property={property} />}
    </div>
  )
}

// Payment-health summary for a lease: a pure-SVG donut of % paid plus a
// billed / paid / pending / payments strip. All figures derive from the
// lease's charges + recorded payments — no new data. (Idea borrowed from the
// Rio Rancho tenant portal's "Resumen de Pagos".)
function PaymentHealth({
  charges,
  paymentsByCharge,
}: {
  charges: RentCharge[]
  paymentsByCharge: Map<string, RentPayment[]>
}) {
  const active = charges.filter((c) => effectiveChargeStatus(c) !== 'waived')
  if (active.length === 0) return null

  const billed = active.reduce((s, c) => s + c.amount_due, 0)
  const paid = active.reduce((s, c) => s + Math.min(c.amount_paid, c.amount_due), 0)
  const pending = Math.max(billed - paid, 0)
  const pct = billed > 0 ? Math.round((paid / billed) * 100) : 0
  const payCount = active.reduce((n, c) => n + (paymentsByCharge.get(c.id)?.length ?? 0), 0)

  const r = 26
  const sw = 7
  const circumference = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circumference

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
            <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
            {pct > 0 && (
              <circle
                cx="36"
                cy="36"
                r={r}
                fill="none"
                stroke="#111827"
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold tabular-nums text-gray-900">{pct}%</span>
            <span className="text-[9px] uppercase tracking-wide text-gray-400">paid</span>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <HealthTile label="Billed" value={usd(billed)} />
          <HealthTile label="Paid" value={usd(paid)} tone="ok" />
          <HealthTile label="Pending" value={usd(pending)} tone={pending > 0 ? 'warn' : undefined} />
          <HealthTile label="Payments" value={String(payCount)} />
        </div>
      </div>
    </div>
  )
}

function HealthTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === 'ok' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
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
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-gray-800">How tenants pay &amp; reminders</h3>
        <span className="text-[11px] text-gray-400">
          {summary} · reminders {property.auto_reminders ? 'on' : 'off'}
        </span>
      </div>
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
    </div>
  )
}

function AddTenantForm({ propertyId, unit }: { propertyId: string; unit: Unit }) {
  return (
    <details className="mt-3 border-t border-gray-100 pt-3">
      <summary className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:border-gray-900 hover:bg-gray-50 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        + Add tenant
      </summary>
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

function EditProperty({ property }: { property: Property }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-gray-800">Property details</h3>
        <span className="text-[11px] text-gray-400">name · address · facts · valuation</span>
      </div>
      <form action={updateProperty.bind(null, property.id)} className="mt-4 space-y-3">
        <div>
          <label className={label} htmlFor="name">Property name</label>
          <input id="name" name="name" required defaultValue={property.name} className={input} />
        </div>
        <PropertyAddressInput
          labelClassName={label}
          inputClassName={input}
          defaultValue={property.address ?? ''}
          defaultLat={property.lat}
          defaultLng={property.lng}
          defaultPlaceId={property.place_id}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={label} htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={property.type} className={input}>
              {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map((k) => (
                <option key={k} value={k}>{PROPERTY_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="year_built">Year built</label>
            <input id="year_built" name="year_built" inputMode="numeric" defaultValue={property.year_built ? String(property.year_built) : ''} placeholder="1998" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="lot_size">Lot size</label>
            <input id="lot_size" name="lot_size" defaultValue={property.lot_size ?? ''} placeholder="0.25 acres" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="parcel_number">Parcel # (APN)</label>
            <input id="parcel_number" name="parcel_number" defaultValue={property.parcel_number ?? ''} className={input} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="multi_unit" defaultChecked={property.multi_unit} className="rounded border-gray-300" />
          Multiple units (multi-family building)
          <span className="text-[11px] text-gray-400">— turn on to manage more than one unit</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="est_value">Estimated value</label>
            <input id="est_value" name="est_value" inputMode="decimal" defaultValue={property.est_value != null ? String(property.est_value) : ''} placeholder="73000" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="purchase_price">Purchase price</label>
            <input id="purchase_price" name="purchase_price" inputMode="decimal" defaultValue={property.purchase_price != null ? String(property.purchase_price) : ''} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="purchase_date">Purchase date</label>
            <input id="purchase_date" name="purchase_date" type="date" defaultValue={property.purchase_date ?? ''} className={input} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} defaultValue={property.notes ?? ''} className={input} />
          <p className="text-[11px] text-gray-400 mt-1">The Overseer reads these notes into the owner&apos;s profile.</p>
        </div>
        <button type="submit" className={btnPrimary}>Save changes</button>
      </form>
    </div>
  )
}

// Settings tab: every editable control for the property, laid out like a real
// settings page — a heading + a left sidebar of sections.
function SettingsSection({ property, collaborators }: { property: Property; collaborators: Collaborator[] }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="mt-0.5 text-xs text-gray-400">{property.name}</p>
      </div>
      <SettingsSidebar
        details={<EditProperty property={property} />}
        collaborators={<CollaboratorsSection propertyId={property.id} collaborators={collaborators} />}
        danger={<DangerZone property={property} />}
      />
    </div>
  )
}

function DangerZone({ property }: { property: Property }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <h3 className="text-[13px] font-semibold text-red-700">Danger zone</h3>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-600">
          Archiving hides this property from your portfolio. Its rent history and documents are kept.
        </p>
        <form action={archiveProperty.bind(null, property.id)}>
          <button type="submit" className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-600 hover:text-white">
            Archive this property
          </button>
        </form>
      </div>
    </div>
  )
}

function CollaboratorsSection({ propertyId, collaborators }: { propertyId: string; collaborators: Collaborator[] }) {
  const active = collaborators.filter((c) => c.status !== 'removed')
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-gray-800">Collaborators</h3>
        <span className="text-[11px] text-gray-400">third-party managers for this property</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Invite someone to help manage this one property. They get their own login and see only this property — not the rest of your portfolio.
      </p>

      {active.length > 0 && (
        <div className="mt-3 space-y-2">
          {active.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{c.name || c.email}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {c.name ? `${c.email} · ` : ''}
                  {COLLABORATOR_ROLE_LABELS[c.role]}
                  {c.accepted_at ? ` · since ${fmtDate(c.accepted_at)}` : ` · invited ${fmtDate(c.invited_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    c.status === 'active' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}
                >
                  {COLLABORATOR_STATUS_LABELS[c.status]}
                </span>
                {c.status === 'invited' && (
                  <form action={resendCollaborator.bind(null, propertyId, c.id)}>
                    <button type="submit" className="text-[11px] font-medium text-gray-600 hover:text-gray-900">Resend</button>
                  </form>
                )}
                <form action={removeCollaborator.bind(null, propertyId, c.id)}>
                  <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600">Remove</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={inviteCollaborator.bind(null, propertyId)} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <label className={label} htmlFor="collab_email">Email</label>
          <input id="collab_email" name="email" type="email" required placeholder="manager@example.com" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="collab_name">Name</label>
          <input id="collab_name" name="name" placeholder="optional" className={input} />
        </div>
        <div className="sm:col-span-1">
          <label className={label} htmlFor="collab_role">Role</label>
          <select id="collab_role" name="role" defaultValue="manager" className={input}>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="sm:col-span-6 flex items-center gap-3">
          <button type="submit" className={btnPrimary}>Invite collaborator</button>
          <span className="text-[11px] text-gray-400">They&apos;ll get an email invite to accept.</span>
        </div>
      </form>
    </div>
  )
}

function EditUnit({ propertyId, unit, hasLease, single }: { propertyId: string; unit: Unit; hasLease: boolean; single?: boolean }) {
  return (
    <details className="mt-3 border-t border-gray-100 pt-3">
      <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-900 select-none">{single ? 'Edit home details' : 'Edit unit'}</summary>
      <form action={updateUnit.bind(null, propertyId, unit.id)} className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className={label} htmlFor={`u_label_${unit.id}`}>Label</label>
          <input id={`u_label_${unit.id}`} name="label" defaultValue={unit.label} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`u_beds_${unit.id}`}>Beds</label>
          <input id={`u_beds_${unit.id}`} name="bedrooms" inputMode="decimal" defaultValue={unit.bedrooms != null ? String(unit.bedrooms) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`u_baths_${unit.id}`}>Baths</label>
          <input id={`u_baths_${unit.id}`} name="bathrooms" inputMode="decimal" defaultValue={unit.bathrooms != null ? String(unit.bathrooms) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`u_sqft_${unit.id}`}>Sqft</label>
          <input id={`u_sqft_${unit.id}`} name="sqft" inputMode="numeric" defaultValue={unit.sqft != null ? String(unit.sqft) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`u_rent_${unit.id}`}>Market rent</label>
          <input id={`u_rent_${unit.id}`} name="market_rent" inputMode="decimal" defaultValue={unit.market_rent != null ? String(unit.market_rent) : ''} className={input} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={label} htmlFor={`u_notes_${unit.id}`}>Notes</label>
          <input id={`u_notes_${unit.id}`} name="notes" defaultValue={unit.notes ?? ''} placeholder="Parking, appliances, quirks…" className={input} />
        </div>
        <div className="col-span-2 sm:col-span-4 flex items-center gap-4">
          <button type="submit" className={btnPrimary}>{single ? 'Save home' : 'Save unit'}</button>
          {!hasLease && !single && (
            <span className="text-[11px] text-gray-400">Empty unit — you can delete it below.</span>
          )}
          {single && (
            <span className="text-[11px] text-gray-400">Turn on “Multiple units” above to split this into more units.</span>
          )}
        </div>
      </form>
      {!hasLease && !single && (
        <form action={deleteUnit.bind(null, propertyId, unit.id)} className="mt-2">
          <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600 transition-colors">Delete unit</button>
        </form>
      )}
    </details>
  )
}

function TenantProfileForm({ propertyId, lease, profile }: { propertyId: string; lease: Lease; profile: TenantProfile | null }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-900 select-none">
        Tenant profile{profile?.ssn_last4 ? ` · SSN ${maskSsn(profile.ssn_last4)}` : profile ? ' · on file' : ''}
      </summary>
      <form action={saveTenantProfile.bind(null, propertyId, lease.id)} className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <p className="col-span-2 sm:col-span-3 text-[11px] text-gray-400">
          Name, email &amp; phone live on the lease. This is the rest of {lease.tenant_name}&apos;s record — the SSN is encrypted at rest.
        </p>
        <div>
          <label className={label} htmlFor={`t_dob_${lease.id}`}>Date of birth</label>
          <input id={`t_dob_${lease.id}`} name="dob" type="date" defaultValue={profile?.dob ?? ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`t_ssn_${lease.id}`}>SSN</label>
          <input id={`t_ssn_${lease.id}`} name="ssn" inputMode="numeric" placeholder={profile?.ssn_last4 ? maskSsn(profile.ssn_last4) : '000-00-0000'} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`t_idtype_${lease.id}`}>ID type</label>
          <select id={`t_idtype_${lease.id}`} name="id_type" defaultValue={profile?.id_type ?? ''} className={input}>
            <option value="">—</option>
            {(Object.keys(ID_TYPE_LABELS) as IdType[]).map((k) => (
              <option key={k} value={k}>{ID_TYPE_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={label} htmlFor={`t_addr_${lease.id}`}>Current / mailing address</label>
          <input id={`t_addr_${lease.id}`} name="current_address" defaultValue={profile?.current_address ?? ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`t_emp_${lease.id}`}>Employer</label>
          <input id={`t_emp_${lease.id}`} name="employer" defaultValue={profile?.employer ?? ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`t_inc_${lease.id}`}>Monthly income</label>
          <input id={`t_inc_${lease.id}`} name="monthly_income" inputMode="decimal" defaultValue={profile?.monthly_income != null ? String(profile.monthly_income) : ''} className={input} />
        </div>
        <div>
          <label className={label} htmlFor={`t_ec_${lease.id}`}>Emergency contact</label>
          <input id={`t_ec_${lease.id}`} name="emergency_contact_name" defaultValue={profile?.emergency_contact_name ?? ''} className={input} />
        </div>
        <div className="col-span-2">
          <label className={label} htmlFor={`t_ecp_${lease.id}`}>Emergency phone</label>
          <input id={`t_ecp_${lease.id}`} name="emergency_contact_phone" defaultValue={profile?.emergency_contact_phone ?? ''} className={input} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={label} htmlFor={`t_notes_${lease.id}`}>Notes</label>
          <input id={`t_notes_${lease.id}`} name="notes" defaultValue={profile?.notes ?? ''} className={input} />
        </div>
        <div className="col-span-2 sm:col-span-3 flex items-center gap-3">
          <button type="submit" className={btnPrimary}>Save profile</button>
          <span className="text-[11px] text-gray-400">Leave SSN blank to keep the stored value.</span>
        </div>
      </form>
    </details>
  )
}

function DocumentsSection({
  propertyId,
  units,
  documents,
  canManage,
}: {
  propertyId: string
  units: Unit[]
  documents: PropertyDocWithUrl[]
  canManage: boolean
}) {
  return (
    <DocumentsShelf
      documents={documents.map((d) => ({
        id: d.id,
        name: d.name,
        url: d.url ?? null,
        doc_kind: d.doc_kind,
        ai_summary: d.ai_summary,
        ai_status: d.ai_status,
        created_at: d.created_at,
      }))}
      canManage={canManage}
      propertyId={propertyId}
      parseAction={parsePropertyDocument}
      deleteAction={deletePropertyDoc}
    >
      {canManage && <DocUploadModal action={uploadPropertyDoc.bind(null, propertyId)} />}
    </DocumentsShelf>
  )
}

function MessagesThread({ propertyId, lease, messages }: { propertyId: string; lease: Lease; messages: TenantMessage[] }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] font-medium text-gray-500 hover:text-gray-900 select-none">
        Messages{messages.length ? ` · ${messages.length}` : ''}
      </summary>

      {messages.length > 0 && (
        <div className="mt-2 space-y-2">
          {messages.map((m) => {
            const out = m.direction === 'outbound'
            return (
              <div key={m.id} className={`rounded-lg border border-gray-200 p-2.5 text-sm ${out ? 'bg-gray-50 ml-6' : 'mr-6'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    {out ? 'Sent to tenant' : 'From tenant'}
                    {m.channel === 'note' ? ' · note' : ''}
                    {m.status === 'failed' ? ' · email failed' : ''}
                  </span>
                  <span className="text-[10px] text-gray-400" suppressHydrationWarning>{fmtDate(m.created_at)}</span>
                </div>
                {m.subject && <p className="text-[13px] font-medium text-gray-900 mt-1">{m.subject}</p>}
                <p className="text-[13px] text-gray-700 whitespace-pre-line mt-0.5">{m.body}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Compose — emails the tenant + logs to the thread */}
      <form action={sendTenantMessage.bind(null, propertyId, lease.id)} className="mt-3 space-y-2">
        <input name="subject" placeholder="Subject" className={input} />
        <textarea name="body" rows={3} required placeholder={`Write to ${lease.tenant_name}…`} className={input} />
        <div className="flex items-center gap-3">
          <button type="submit" className={btnPrimary} disabled={!lease.tenant_email}>Send email</button>
          {!lease.tenant_email && <span className="text-[11px] text-amber-600">Add a tenant email on the lease to send.</span>}
        </div>
      </form>

      {/* Log a message received from the tenant (no automated inbound yet) */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-700 select-none">Log a message you received</summary>
        <form action={logTenantMessage.bind(null, propertyId, lease.id)} className="mt-2 space-y-2">
          <textarea name="body" rows={2} required placeholder="What the tenant said (phone, text, in person)…" className={input} />
          <button type="submit" className={btnPrimary}>Log to thread</button>
        </form>
      </details>
    </details>
  )
}

const APP_STATUS_STYLE: Record<string, string> = {
  invited: 'text-gray-600 bg-gray-50 border-gray-200',
  submitted: 'text-blue-700 bg-blue-50 border-blue-200',
  approved: 'text-green-700 bg-green-50 border-green-200',
  declined: 'text-gray-400 bg-gray-50 border-gray-200',
  withdrawn: 'text-gray-400 bg-gray-50 border-gray-200',
}

function AppField({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <span className="text-gray-400">{k}: </span>
      <span className="text-gray-800">{v || '—'}</span>
    </div>
  )
}

function AppSubhead({ children }: { children: React.ReactNode }) {
  return <p className="col-span-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:col-span-3">{children}</p>
}

// Full, sectioned review of a submitted application for the manager.
function AppReview({ a }: { a: RentalApplication }) {
  const d = a.details ?? {}
  const has = (...vals: unknown[]) => vals.some((v) => v != null && v !== '')
  const money = (n: number | null | undefined) => (n != null ? usd(n) : null)
  const answered = SCREENING_QUESTIONS.filter((q) => d.screening?.[q.key])
  const flagged = answered.filter((q) => d.screening?.[q.key]?.yes)

  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <AppSubhead>Applicant</AppSubhead>
        <AppField k="Email" v={a.email} />
        <AppField k="Phone" v={a.phone} />
        <AppField k="DOB" v={a.dob} />
        <AppField k="Move-in" v={a.desired_move_in} />
        <AppField k="ID" v={has(d.id_number, d.id_state) ? [d.id_number, d.id_state].filter(Boolean).join(' · ') : null} />
        <AppField k="SSN" v={a.ssn_last4 ? maskSsn(a.ssn_last4) : null} />

        {has(a.current_address, d.current_landlord, d.current_rent, d.current_since, d.reason_leaving) && (
          <>
            <AppSubhead>Current residence</AppSubhead>
            <AppField k="Address" v={a.current_address} />
            <AppField k="Landlord" v={has(d.current_landlord, d.current_landlord_phone) ? [d.current_landlord, d.current_landlord_phone].filter(Boolean).join(' · ') : null} />
            <AppField k="Rent" v={money(d.current_rent)} />
            <AppField k="Since" v={d.current_since ?? null} />
            <AppField k="Reason leaving" v={d.reason_leaving ?? null} />
          </>
        )}

        {has(d.prior_address, a.prior_landlord, d.prior_rent, d.prior_dates, d.prior_reason_leaving) && (
          <>
            <AppSubhead>Prior residence</AppSubhead>
            <AppField k="Address" v={d.prior_address ?? null} />
            <AppField k="Landlord" v={has(a.prior_landlord, d.prior_landlord_phone) ? [a.prior_landlord, d.prior_landlord_phone].filter(Boolean).join(' · ') : null} />
            <AppField k="Rent" v={money(d.prior_rent)} />
            <AppField k="Dates" v={d.prior_dates ?? null} />
            <AppField k="Reason leaving" v={d.prior_reason_leaving ?? null} />
          </>
        )}

        <AppSubhead>Employment &amp; income</AppSubhead>
        <AppField k="Employer" v={a.employer} />
        <AppField k="Title" v={d.job_title ?? null} />
        <AppField k="Employer phone" v={d.employer_phone ?? null} />
        <AppField k="Supervisor" v={d.supervisor ?? null} />
        <AppField k="Employed since" v={d.employed_since ?? null} />
        <AppField k="Monthly income" v={money(a.monthly_income)} />
        <AppField k="Other income" v={has(d.other_income_source, d.other_income_amount) ? [d.other_income_source, money(d.other_income_amount)].filter(Boolean).join(' · ') : null} />

        <AppSubhead>Household</AppSubhead>
        <AppField k="Occupants" v={a.occupants != null ? String(a.occupants) : null} />
        <AppField k="Pets" v={a.pets} />
        <AppField k="Vehicles" v={a.vehicles} />
        <AppField k="Co-applicant" v={d.co_applicant ?? null} />
        <AppField k="Other occupants" v={d.other_occupants ?? null} />

        {has(d.emergency_name, d.emergency_phone) && (
          <>
            <AppSubhead>Emergency contact</AppSubhead>
            <AppField k="Name" v={d.emergency_name ?? null} />
            <AppField k="Relationship" v={d.emergency_relationship ?? null} />
            <AppField k="Phone" v={d.emergency_phone ?? null} />
          </>
        )}
      </div>

      {a.references_text && (
        <p className="mt-3 text-xs text-gray-600"><span className="text-gray-400">References: </span>{a.references_text}</p>
      )}

      {answered.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Background {flagged.length > 0 && <span className="ml-1 text-amber-600">· {flagged.length} flagged</span>}
          </p>
          <div className="mt-1 space-y-1">
            {answered.map((q) => {
              const ans = d.screening![q.key]
              return (
                <div key={q.key} className="text-xs">
                  <span className={ans.yes ? 'font-semibold text-amber-700' : 'text-gray-500'}>{ans.yes ? 'Yes' : 'No'}</span>
                  <span className="text-gray-600"> — {q.prompt}</span>
                  {ans.yes && ans.explanation && <span className="text-gray-500"> ({ans.explanation})</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {a.notes && <p className="mt-3 text-xs text-gray-600"><span className="text-gray-400">Notes: </span>{a.notes}</p>}

      <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
        {a.consent_bg ? 'Authorized background/credit check.' : 'No background-check consent.'}
        {d.signature ? ` · Signed “${d.signature}”` : ''}
        {d.signed_date ? ` on ${fmtDate(d.signed_date)}` : ''}
      </p>
    </div>
  )
}

function ApplicationsSection({
  propertyId,
  units,
  applications,
  baseUrl,
  canManage,
}: {
  propertyId: string
  units: Unit[]
  applications: RentalApplication[]
  baseUrl: string
  canManage: boolean
}) {
  const unitLabel = new Map(units.map((u) => [u.id, u.label]))
  return (
    <div className="mt-4">
      {canManage &&
        (units.length > 0 ? (
          <form action={inviteApplicant.bind(null, propertyId)} className="rounded-xl border border-dashed border-gray-200 p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className={label} htmlFor="app_email">Prospect email</label>
              <input id="app_email" name="email" type="email" required placeholder="prospect@email.com" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="app_unit">Unit</label>
              <select id="app_unit" name="unit_id" required className={input} defaultValue="">
                <option value="" disabled>Choose…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className={btnPrimary}>Email application link</button>
            <span className="text-[11px] text-gray-400 basis-full">Sends a private link the prospect fills out — no login needed. On approval it becomes a tenant + lease.</span>
          </form>
        ) : (
          <p className="text-sm text-gray-500">Add a unit before inviting applicants.</p>
        ))}

      {applications.length > 0 && (
        <div className="mt-3 space-y-2">
          {applications.map((a) => {
            const submitted = a.status === 'submitted'
            const applyUrl = baseUrl ? `${baseUrl}/apply/${a.token}` : `/apply/${a.token}`
            return (
              <div key={a.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.full_name || a.invite_email || 'Applicant'}</p>
                      <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${APP_STATUS_STYLE[a.status] ?? APP_STATUS_STYLE.invited}`}>
                        {APPLICATION_STATUS_LABELS[a.status]}
                      </span>
                      {a.unit_id && <span className="text-[10px] uppercase tracking-wide text-gray-400">{unitLabel.get(a.unit_id) ?? ''}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {a.invite_email ? `Invited ${a.invite_email}` : ''}
                      {a.submitted_at ? ` · submitted ${fmtDate(a.submitted_at)}` : a.invited_at ? ` · invited ${fmtDate(a.invited_at)}` : ''}
                    </p>
                  </div>
                  {canManage && submitted && (
                    <div className="flex items-center gap-3 shrink-0">
                      <form action={approveApplication.bind(null, propertyId, a.id)}>
                        <button type="submit" className="text-[11px] font-medium text-green-700 hover:text-green-900">Approve</button>
                      </form>
                      <form action={declineApplication.bind(null, propertyId, a.id)}>
                        <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600">Decline</button>
                      </form>
                    </div>
                  )}
                </div>

                {a.status === 'invited' && (
                  <p className="mt-2 text-[11px] text-gray-500 break-all">
                    Awaiting submission · link: <span className="text-gray-700">{applyUrl}</span>
                  </p>
                )}

                {submitted && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-gray-600 hover:text-gray-900 select-none">Review details</summary>
                    <AppReview a={a} />
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  addW2,
  deleteW2,
  add1099,
  delete1099,
  addScheduleC,
  deleteScheduleC,
  addScheduleE,
  deleteScheduleE,
} from '@/app/admin/clients/[slug]/[year]/income-actions'
import {
  FORM_1099_TYPES,
  form1099Short,
  SCHEDULE_C_EXPENSES,
  SCHEDULE_E_EXPENSES,
  PROPERTY_TYPES,
  scheduleCNet,
  scheduleENet,
  type W2Income,
  type Income1099,
  type ScheduleC,
  type ScheduleE,
} from '@/lib/income'

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const inputCls =
  'border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">{hint}</p>
      {children}
    </div>
  )
}

function AddToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
    >
      {open ? '− Cancel' : `+ ${label}`}
    </button>
  )
}

export default function IncomeWorkspace({
  slug,
  year,
  w2,
  f1099,
  scheduleC,
  scheduleE,
}: {
  slug: string
  year: number
  w2: W2Income[]
  f1099: Income1099[]
  scheduleC: ScheduleC[]
  scheduleE: ScheduleE[]
}) {
  const [openW2, setOpenW2] = useState(false)
  const [open1099, setOpen1099] = useState(false)
  const [openSC, setOpenSC] = useState(false)
  const [openSE, setOpenSE] = useState(false)

  // Live Schedule E net as the user fills the add form.
  const [seRents, setSeRents] = useState(0)
  const [seExp, setSeExp] = useState<Record<string, number>>({})
  const seExpTotal = Object.values(seExp).reduce((a, b) => a + (b || 0), 0)
  const seNetPreview = seRents - seExpTotal

  // Live Schedule C net as the user fills the add form.
  const [scGross, setScGross] = useState(0)
  const [scReturns, setScReturns] = useState(0)
  const [scCogs, setScCogs] = useState(0)
  const [scExp, setScExp] = useState<Record<string, number>>({})
  const scExpTotal = Object.values(scExp).reduce((a, b) => a + (b || 0), 0)
  const scNetPreview = scGross - scReturns - scCogs - scExpTotal

  return (
    <div className="space-y-6">
      {/* ── W-2 ─────────────────────────────────────────────────────────── */}
      <Section title="W-2 wages" hint="Wage and salary income. Box 1 wages and Box 2 federal withholding drive the totals.">
        {w2.length > 0 ? (
          <div className="divide-y divide-gray-100 mb-3">
            {w2.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-gray-900">{r.employer_name}</span>
                  {r.state && <span className="text-gray-500"> · {r.state}</span>}
                </div>
                <div className="flex items-center gap-4 whitespace-nowrap">
                  <span className="text-gray-900 tabular-nums">{money(r.wages)}</span>
                  <span className="text-gray-400 tabular-nums text-xs">w/h {money(r.fed_withholding)}</span>
                  <form action={deleteW2.bind(null, slug, year, r.id)}>
                    <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">No W-2s entered.</p>
        )}

        <div className="border-t border-gray-100 pt-3">
          <AddToggle open={openW2} onClick={() => setOpenW2((v) => !v)} label="Add a W-2" />
          {openW2 && (
            <form action={addW2.bind(null, slug, year)} className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-2">
                <label className={labelCls}>Employer</label>
                <input name="employer_name" required className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Employer EIN</label>
                <input name="employer_ein" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Wages (Box 1)</label>
                <input name="wages" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Fed w/h (Box 2)</label>
                <input name="fed_withholding" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>SS wages (Box 3)</label>
                <input name="ss_wages" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Medicare wages (Box 5)</label>
                <input name="medicare_wages" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input name="state" maxLength={2} className={`${inputCls} w-full uppercase`} />
              </div>
              <div>
                <label className={labelCls}>State wages (Box 16)</label>
                <input name="state_wages" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>State w/h (Box 17)</label>
                <input name="state_withholding" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <button className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800">
                  Save W-2
                </button>
              </div>
            </form>
          )}
        </div>
      </Section>

      {/* ── 1099 ────────────────────────────────────────────────────────── */}
      <Section title="1099 income" hint="Nonemployee comp, interest, dividends, retirement, government payments — the full 1099 family.">
        {f1099.length > 0 ? (
          <div className="divide-y divide-gray-100 mb-3">
            {f1099.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 mr-2">
                    {form1099Short(r.form_type)}
                  </span>
                  <span className="font-medium text-gray-900">{r.payer_name}</span>
                  {r.description && <span className="text-gray-500"> · {r.description}</span>}
                </div>
                <div className="flex items-center gap-4 whitespace-nowrap">
                  <span className="text-gray-900 tabular-nums">{money(r.amount)}</span>
                  {r.fed_withholding > 0 && (
                    <span className="text-gray-400 tabular-nums text-xs">w/h {money(r.fed_withholding)}</span>
                  )}
                  <form action={delete1099.bind(null, slug, year, r.id)}>
                    <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">No 1099s entered.</p>
        )}

        <div className="border-t border-gray-100 pt-3">
          <AddToggle open={open1099} onClick={() => setOpen1099((v) => !v)} label="Add a 1099" />
          {open1099 && (
            <form action={add1099.bind(null, slug, year)} className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Form</label>
                <select name="form_type" defaultValue="nec" className={`${inputCls} w-full bg-white`}>
                  {FORM_1099_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <label className={labelCls}>Payer</label>
                <input name="payer_name" required className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Payer TIN</label>
                <input name="payer_tin" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Amount</label>
                <input name="amount" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Fed w/h</label>
                <input name="fed_withholding" inputMode="decimal" className={`${inputCls} w-full`} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Note (box / nature)</label>
                <input name="description" className={`${inputCls} w-full`} placeholder="e.g. Box 1 — contract design work" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <button className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800">
                  Save 1099
                </button>
              </div>
            </form>
          )}
        </div>
      </Section>

      {/* ── Schedule C ──────────────────────────────────────────────────── */}
      <Section
        title="Schedule C — self-employment"
        hint="A sole-prop / self-employment business on the 1040. Net profit (gross − returns − COGS − expenses) flows into total income."
      >
        {scheduleC.length > 0 ? (
          <div className="divide-y divide-gray-100 mb-3">
            {scheduleC.map((r) => {
              const net = scheduleCNet(r)
              return (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{r.business_name}</span>
                    {r.principal_activity && <span className="text-gray-500"> · {r.principal_activity}</span>}
                    <span className="block text-xs text-gray-400">Gross {money(r.gross_receipts)}</span>
                  </div>
                  <div className="flex items-center gap-4 whitespace-nowrap">
                    <span className={`tabular-nums font-medium ${net < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      Net {money(net)}
                    </span>
                    <form action={deleteScheduleC.bind(null, slug, year, r.id)}>
                      <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">No Schedule C businesses entered.</p>
        )}

        <div className="border-t border-gray-100 pt-3">
          <AddToggle open={openSC} onClick={() => setOpenSC((v) => !v)} label="Add a Schedule C" />
          {openSC && (
            <form action={addScheduleC.bind(null, slug, year)} className="mt-3 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelCls}>Business name</label>
                  <input name="business_name" required className={`${inputCls} w-full`} />
                </div>
                <div>
                  <label className={labelCls}>Accounting method</label>
                  <select name="accounting_method" defaultValue="cash" className={`${inputCls} w-full bg-white`}>
                    <option value="cash">Cash</option>
                    <option value="accrual">Accrual</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelCls}>Principal activity</label>
                  <input name="principal_activity" className={`${inputCls} w-full`} placeholder="e.g. Rideshare driving" />
                </div>
                <div>
                  <label className={labelCls}>NAICS</label>
                  <input name="naics_code" className={`${inputCls} w-full`} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Gross receipts</label>
                  <input
                    name="gross_receipts"
                    inputMode="decimal"
                    onChange={(e) => setScGross(Number(e.target.value.replace(/[$,\s]/g, '')) || 0)}
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Returns &amp; allow.</label>
                  <input
                    name="returns_allowances"
                    inputMode="decimal"
                    onChange={(e) => setScReturns(Number(e.target.value.replace(/[$,\s]/g, '')) || 0)}
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div>
                  <label className={labelCls}>COGS</label>
                  <input
                    name="cogs"
                    inputMode="decimal"
                    onChange={(e) => setScCogs(Number(e.target.value.replace(/[$,\s]/g, '')) || 0)}
                    className={`${inputCls} w-full`}
                  />
                </div>
              </div>

              <div>
                <p className={labelCls}>Expenses (Part II)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCHEDULE_C_EXPENSES.map((e) => (
                    <div key={e.key} className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-28 shrink-0 truncate" title={e.label}>
                        {e.label}
                      </label>
                      <input
                        name={`exp_${e.key}`}
                        inputMode="decimal"
                        onChange={(ev) =>
                          setScExp((prev) => ({
                            ...prev,
                            [e.key]: Number(ev.target.value.replace(/[$,\s]/g, '')) || 0,
                          }))
                        }
                        className={`${inputCls} w-full`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-sm text-gray-500">
                  Preview net:{' '}
                  <span className={`font-semibold tabular-nums ${scNetPreview < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {money(scNetPreview)}
                  </span>
                </span>
                <button className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800">
                  Save Schedule C
                </button>
              </div>
            </form>
          )}
        </div>
      </Section>

      {/* ── Schedule E — rentals ──────────────────────────────────────────── */}
      <Section
        title="Schedule E — rentals & royalties"
        hint="Rental or royalty properties. Net income (rents − expenses, including depreciation) flows into total income; a loss offsets other income subject to passive-loss limits."
      >
        {scheduleE.length > 0 ? (
          <div className="divide-y divide-gray-100 mb-3">
            {scheduleE.map((r) => {
              const net = scheduleENet(r)
              return (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{r.property_label}</span>
                    {r.property_type && <span className="text-gray-500"> · {r.property_type}</span>}
                    <span className="block text-xs text-gray-400">Rents {money(r.rents_received)}</span>
                  </div>
                  <div className="flex items-center gap-4 whitespace-nowrap">
                    <span className={`tabular-nums font-medium ${net < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      Net {money(net)}
                    </span>
                    <form action={deleteScheduleE.bind(null, slug, year, r.id)}>
                      <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-3">No rental properties entered.</p>
        )}

        <div className="border-t border-gray-100 pt-3">
          <AddToggle open={openSE} onClick={() => setOpenSE((v) => !v)} label="Add a property" />
          {openSE && (
            <form action={addScheduleE.bind(null, slug, year)} className="mt-3 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelCls}>Property name</label>
                  <input name="property_label" required placeholder="123 Main St" className={`${inputCls} w-full`} />
                </div>
                <div>
                  <label className={labelCls}>Type</label>
                  <select name="property_type" defaultValue="residential" className={`${inputCls} w-full bg-white`}>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className={labelCls}>Address</label>
                  <input name="address" className={`${inputCls} w-full`} />
                </div>
                <div>
                  <label className={labelCls}>Rents received</label>
                  <input
                    name="rents_received"
                    inputMode="decimal"
                    onChange={(e) => setSeRents(Number(e.target.value.replace(/[$,\s]/g, '')) || 0)}
                    className={`${inputCls} w-full`}
                  />
                </div>
              </div>

              <div>
                <p className={labelCls}>Expenses</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCHEDULE_E_EXPENSES.map((e) => (
                    <div key={e.key} className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 w-28 shrink-0 truncate" title={e.label}>
                        {e.label}
                      </label>
                      <input
                        name={`exp_${e.key}`}
                        inputMode="decimal"
                        onChange={(ev) =>
                          setSeExp((prev) => ({
                            ...prev,
                            [e.key]: Number(ev.target.value.replace(/[$,\s]/g, '')) || 0,
                          }))
                        }
                        className={`${inputCls} w-full`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-sm text-gray-500">
                  Preview net:{' '}
                  <span className={`font-semibold tabular-nums ${seNetPreview < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {money(seNetPreview)}
                  </span>
                </span>
                <button className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800">
                  Save property
                </button>
              </div>
            </form>
          )}
        </div>
      </Section>
    </div>
  )
}

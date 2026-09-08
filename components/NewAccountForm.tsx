'use client'

import Link from 'next/link'
import { useState } from 'react'
import { NameSlugFields, OwnersField, AddressAutocomplete } from '@/components/OnboardingFields'
import { ENTITY_TYPE_LABELS, type Organization } from '@/lib/types'
import { CHART_TEMPLATES, DEFAULT_TEMPLATE_KEY } from '@/lib/coa'
import { createClientAccount } from '@/app/admin/new/actions'

const selectCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

const FILING_STATUSES: { value: string; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'qw', label: 'Qualifying surviving spouse' },
]

export default function NewAccountForm({
  firms,
  isPlatform,
  defaultOrg,
}: {
  firms: Organization[]
  isPlatform: boolean
  defaultOrg?: string
}) {
  const [kind, setKind] = useState<'business' | 'individual'>('business')
  const isIndividual = kind === 'individual'

  const KindCard = ({ value, title, hint }: { value: 'business' | 'individual'; title: string; hint: string }) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className={`flex-1 text-left rounded-xl border p-3.5 transition-colors ${
        kind === value ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="text-sm font-medium text-gray-900">{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{hint}</div>
    </button>
  )

  return (
    <form action={createClientAccount} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />

      {/* Account type */}
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Account type</legend>
        <div className="flex gap-3">
          <KindCard value="business" title="Business" hint="LLC, corporation, partnership — has its own books." />
          <KindCard value="individual" title="Individual" hint="A person / 1040 filer — W-2, 1099, Schedule C." />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {isIndividual ? 'Person' : 'Business'}
        </legend>
        {isPlatform && firms.length > 1 && (
          <div>
            <label htmlFor="org_id" className="block text-xs font-medium text-gray-700 mb-1">
              Firm
            </label>
            <select
              id="org_id"
              name="org_id"
              defaultValue={
                firms.some((f) => f.id === defaultOrg)
                  ? defaultOrg
                  : firms.find((f) => f.is_platform)?.id ?? firms[0]?.id ?? ''
              }
              className={selectCls}
            >
              {firms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.is_platform ? ' (your firm)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Which firm manages this client.</p>
          </div>
        )}
        <NameSlugFields />
        {!isIndividual && <OwnersField />}
        <AddressAutocomplete />
      </fieldset>

      {isIndividual ? (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Tax profile</legend>
          <div>
            <label htmlFor="filing_status" className="block text-xs font-medium text-gray-700 mb-1">
              Filing status
            </label>
            <select id="filing_status" name="filing_status" defaultValue="" className={selectCls}>
              <option value="">— Not sure yet —</option>
              {FILING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Their 1040 workspace organizes W-2s, 1099s, and Schedule C income. You can set this later.
            </p>
          </div>
        </fieldset>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">How they operate</legend>
          <div>
            <label htmlFor="entity_type" className="block text-xs font-medium text-gray-700 mb-1">
              Business type
            </label>
            <select id="entity_type" name="entity_type" defaultValue="" className={selectCls}>
              <option value="">— Not sure yet —</option>
              {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">You can set or change this later on the Profile sheet.</p>
          </div>
          <div>
            <label htmlFor="accounting_method" className="block text-xs font-medium text-gray-700 mb-1">
              Accounting basis
            </label>
            <select id="accounting_method" name="accounting_method" defaultValue="cash" className={selectCls}>
              <option value="cash">Cash basis (recommended)</option>
              <option value="accrual">Accrual basis</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Cash = counted when money moves; accrual = when earned/incurred. Changeable later in settings.
            </p>
          </div>
          <div>
            <label htmlFor="template" className="block text-xs font-medium text-gray-700 mb-1">
              Chart of accounts
            </label>
            <select id="template" name="template" defaultValue={DEFAULT_TEMPLATE_KEY} className={selectCls}>
              {Object.values(CHART_TEMPLATES).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Seeds their starting accounts. Rename, add, or hide any later.</p>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
          {isIndividual ? 'Portal login' : 'Client login'}{' '}
          <span className="font-normal normal-case text-gray-400">· optional</span>
        </legend>
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
            Portal email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder={isIndividual ? 'person@email.com' : 'owner@acme.com'}
            className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
          />
          <p className="text-xs text-gray-500 mt-1">
            Optional. Add it to invite them to the portal now, or leave blank and invite later from settings.
          </p>
        </div>
      </fieldset>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
          {isIndividual ? 'Onboard individual' : 'Onboard account'}
        </button>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900">
          Cancel
        </Link>
      </div>
    </form>
  )
}

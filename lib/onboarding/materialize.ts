import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import type { EntityType } from '@/lib/types'
import type { Owner } from '@/lib/onboarding/questions'
import { CHART_TEMPLATES, DEFAULT_TEMPLATE_KEY, suggestedTemplateKey } from '@/lib/coa'
import { getTemplate, plannedKinds, isCaliforniaState } from '@/lib/compliance'
import { logEvent } from '@/lib/registryServer'
import { recomputeAndPersist } from '@/lib/entityStateServer'

type Admin = ReturnType<typeof createAdminClient>

export type AccountInput = {
  orgId: string
  name: string
  entityType: EntityType | null
  entitySubtype?: string | null
  accountingMethod: 'cash' | 'accrual'
  owners: Owner[]
  hasEmployees: boolean
  state?: string | null
  businessActivity?: string | null
  accountingSystem?: string | null
  formationDate?: string | null
  taxYear?: number | null
  // The Overseer's opening read (from the review step). Used as the entity's
  // overseer_context so its record opens in the same voice the operator saw.
  overseerRead?: string | null
  overseerHandling?: string | null
  createdBy?: string | null
  createdByEmail?: string | null
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const FORMAL = new Set<EntityType>(['partnership', 'llc', 's_corp', 'c_corp', 'nonprofit'])
const SOI = new Set<EntityType>(['llc', 's_corp', 'c_corp', 'nonprofit'])

// The compliance profile a business of this shape most likely owes — the operator
// reviews and can change it, and it drives obligation enrollment.
function complianceProfile(entityType: EntityType | null, hasEmployees: boolean) {
  return {
    files_franchise_tax: !!entityType && FORMAL.has(entityType),
    files_soi: !!entityType && SOI.has(entityType),
    has_employees: hasEmployees,
  }
}

function profileNarrative(inp: AccountInput, entityLabel: string): string {
  const bits: string[] = []
  bits.push(`${inp.name} — ${inp.entitySubtype || entityLabel}${inp.state ? `, based in ${inp.state}` : ''}${inp.formationDate ? `, since ${inp.formationDate}` : ''}.`)
  if (inp.businessActivity) bits.push(inp.businessActivity.trim().replace(/\.?$/, '.'))
  const owners = inp.owners.filter((o) => o.name).map((o) => (o.pct != null ? `${o.name} (${o.pct}%)` : o.name))
  if (owners.length) bits.push(`Owners: ${owners.join(', ')}.`)
  bits.push(inp.hasEmployees ? 'Has employees.' : 'No employees on record.')
  bits.push(`${inp.accountingMethod === 'accrual' ? 'Accrual' : 'Cash'} basis${inp.accountingSystem ? `, currently on ${inp.accountingSystem}` : ''}.`)
  bits.push('Onboarded via the guided interview.')
  return bits.join(' ').slice(0, 3900)
}

// Turn the confirmed onboarding facts into a real, configured account. Shared
// creation path so the account is set up consistently however it was gathered.
export async function createAccount(admin: Admin, inp: AccountInput): Promise<{ clientId: string; slug: string } | { error: string }> {
  // California-only vs out-of-state. Our schedule templates are CA + federal; for
  // an out-of-state entity we drop the CA-specific flags so we never store or
  // enroll California obligations that don't apply (the Overseer's brief still
  // names the correct home-state filings).
  const caScope = isCaliforniaState(inp.state)
  const profile = complianceProfile(inp.entityType, inp.hasEmployees)
  if (!caScope) {
    profile.files_franchise_tax = false
    profile.files_soi = false
  }
  const entityLabel = inp.entityType ? inp.entityType.replace(/_/g, '-') : 'business'
  // Prefer the Overseer's own read (shown to the operator on the review step) so
  // the entity's record opens in that voice; fall back to the deterministic one.
  const aiContext = [inp.overseerRead, inp.overseerHandling].filter(Boolean).join(' ').trim()
  const overseerContext = (aiContext || profileNarrative(inp, entityLabel)).slice(0, 3900)

  // 1) Client row (retry the slug on collision).
  let slug = slugify(inp.name) || 'account'
  let clientId = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const trySlug = attempt === 0 ? slug : `${slug}-${attempt + 1}`
    const { data, error } = await admin
      .from('clients')
      .insert({
        name: inp.name,
        slug: trySlug,
        org_id: inp.orgId,
        owner_name: inp.owners.find((o) => o.name)?.name ?? null,
        entity_type: inp.entityType,
        accounting_method: inp.accountingMethod,
        state: inp.state ?? null,
        files_franchise_tax: profile.files_franchise_tax,
        files_soi: profile.files_soi,
        has_employees: profile.has_employees,
        overseer_context: overseerContext,
      })
      .select('id, slug')
      .single()
    if (!error && data) {
      clientId = data.id as string
      slug = data.slug as string
      break
    }
    if (error && error.code !== '23505') return { error: error.message }
    if (attempt === 4) return { error: 'Could not find a free URL for this account.' }
  }

  // 1b) Open the first tax year — the engagement is period-scoped.
  const firstYear = inp.taxYear && inp.taxYear >= 2000 && inp.taxYear <= 2100 ? inp.taxYear : new Date().getFullYear()
  await admin.from('client_years').insert({ client_id: clientId, year: firstYear, status: 'active' })

  // 2) Owners → officers.
  const owners = inp.owners.filter((o) => o.name)
  if (owners.length) {
    await admin
      .from('entity_officers')
      .insert(owners.map((o) => ({ client_id: clientId, name: o.name, title: 'Owner', ownership_pct: o.pct })))
  }

  // 3) Seed the chart from the best-fit template.
  const templateKey = suggestedTemplateKey(inp.entityType ?? null, null) ?? DEFAULT_TEMPLATE_KEY
  const template = CHART_TEMPLATES[templateKey] ?? CHART_TEMPLATES[DEFAULT_TEMPLATE_KEY]
  await admin.from('chart_of_accounts').insert(
    template.accounts.map((a, i) => ({
      client_id: clientId,
      code: a.code,
      name: a.name,
      type: a.type,
      tax_line: a.tax_line ?? null,
      sort: i,
    }))
  )

  // 4) Mark the operator-confirmed identity fields as verified (provenance).
  const now = new Date().toISOString()
  const verified: { client_id: string; field: string; verified: boolean; confidence: number; updated_at: string }[] = [
    { client_id: clientId, field: 'accounting_method', verified: true, confidence: 1, updated_at: now },
  ]
  if (inp.entityType) verified.push({ client_id: clientId, field: 'entity_type', verified: true, confidence: 1, updated_at: now })
  await admin.from('entity_field_meta').upsert(verified, { onConflict: 'client_id,field' })

  // 5) Enroll the compliance obligations the profile implies.
  const year = new Date().getFullYear()
  const isLLC = inp.entityType === 'llc'
  for (const kind of plannedKinds(profile as Record<string, boolean>, caScope)) {
    const tpl = getTemplate(kind)
    if (!tpl) continue
    const { data: ob } = await admin
      .from('obligations')
      .insert({ client_id: clientId, agency: tpl.agency, kind: tpl.key, label: tpl.label, frequency: tpl.frequency, default_amount: null })
      .select('id')
      .single()
    if (!ob) continue
    const rows = tpl.generate(year, { amount: null, formationMonth: null, isLLC }).map((e) => ({
      obligation_id: ob.id,
      client_id: clientId,
      period_label: e.period_label,
      due_date: e.due_date,
      amount_due: e.amount_due,
      status: 'upcoming' as const,
    }))
    if (rows.length) await admin.from('obligation_events').insert(rows)
  }

  // 6) Registry: the genesis line + a note that it came through the interview.
  await logEvent(admin as unknown as Parameters<typeof logEvent>[0], clientId, {
    kind: 'genesis',
    source: 'system',
    actor: 'System',
    title: `Welcome, ${inp.name}. This is the start of your record on Rovelo Inc.`,
    detail: inp.overseerRead?.trim() || `${entityLabel}${inp.state ? ` · ${inp.state}` : ''} · ${inp.accountingMethod} basis · onboarded via guided interview.`,
  })

  await recomputeAndPersist(admin as unknown as Parameters<typeof recomputeAndPersist>[0], clientId)
  return { clientId, slug }
}

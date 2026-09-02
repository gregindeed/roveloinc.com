'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'
import { createAccount } from '@/lib/onboarding/materialize'
import { normalizeEntityType, type Owner } from '@/lib/onboarding/questions'
import { onboardingBrief, reviseOnboarding, type OnboardingBrief, type OnboardingRevision } from '@/lib/ai'
import { ob } from '@/lib/onboarding/i18n'
import { getTemplate, plannedKinds, isCaliforniaState } from '@/lib/compliance'
import { ENTITY_TYPE_LABELS, type EntityType } from '@/lib/types'

function canUseFirm(viewer: Awaited<ReturnType<typeof requireAdmin>>, orgId: string) {
  return viewer.isPlatform || viewer.orgId === orgId || viewer.firms.some((f) => f.orgId === orgId)
}

// Start a draft onboarding session (the account name establishes context).
export async function startSession(orgId: string, name: string): Promise<{ sessionId: string } | { error: string }> {
  const viewer = await requireAdmin()
  const clean = name.trim()
  if (!clean) return { error: 'An account name is required.' }
  if (!orgId || !canUseFirm(viewer, orgId)) return { error: 'Pick a firm you manage.' }

  const supabase = createClient() // RLS ensures the firm is one you can write
  const { data, error } = await supabase
    .from('onboarding_sessions')
    .insert({ org_id: orgId, account_name: clean, created_by: viewer.userId })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'Could not start onboarding.' }
  return { sessionId: data.id as string }
}

// Persist one answer as a fact (user answers are confirmed by definition).
export async function saveAnswer(sessionId: string, key: string, raw: string, normalized: unknown): Promise<void> {
  await requireAdmin()
  const supabase = createClient()
  await supabase.from('onboarding_facts').upsert(
    { session_id: sessionId, key, raw_value: raw, normalized_value: normalized, source: 'user', confirmed: true },
    { onConflict: 'session_id,key' }
  )
}

// ── Overseer brief (review step) ─────────────────────────────────────────────
const FORMAL = new Set<EntityType>(['partnership', 'llc', 's_corp', 'c_corp', 'nonprofit'])
const SOI = new Set<EntityType>(['llc', 's_corp', 'c_corp', 'nonprofit'])

// A readable snapshot of the facts + the compliance the profile deterministically
// implies — handed to the Overseer so its "handling" plan is grounded, not guessed.
function buildContext(name: string, f: Record<string, unknown>) {
  const et = normalizeEntityType(f.entity_type)
  const hasEmployees = f.has_employees === 'yes'
  const state = typeof f.state === 'string' ? f.state : null
  const caScope = isCaliforniaState(state)
  const profile = {
    files_franchise_tax: !!et && FORMAL.has(et) && caScope,
    files_soi: !!et && SOI.has(et) && caScope,
    has_employees: hasEmployees,
  }
  // Only the obligations the system will ACTUALLY auto-enroll (CA + federal, or
  // federal-only out of state) — so the Overseer never repeats California filings
  // for an out-of-state entity.
  const systemFilings: string[] = []
  for (const kind of plannedKinds(profile as Record<string, boolean>, caScope)) {
    const tpl = getTemplate(kind)
    if (tpl) systemFilings.push(tpl.label)
  }
  const owners = (Array.isArray(f.owners) ? (f.owners as Owner[]) : [])
    .filter((o) => o && o.name)
    .map((o) => (o.pct != null ? `${o.name} (${o.pct}%)` : o.name))
  return {
    name,
    entity_type: et ? ENTITY_TYPE_LABELS[et] : null,
    // The specific subtype the operator chose (e.g. "Limited Partnership (LP)"),
    // if any — the core entity_type still drives compliance.
    entity_subtype: typeof f.entity_subtype === 'string' && f.entity_subtype ? f.entity_subtype : null,
    home_state: state,
    is_california: caScope,
    started: typeof f.formation_date === 'string' && f.formation_date ? f.formation_date : null,
    business_activity: typeof f.business_activity === 'string' ? f.business_activity : null,
    owners,
    has_employees: f.has_employees ?? null,
    accounting_basis: f.accounting_basis === 'accrual' ? 'accrual' : 'cash',
    accounting_system: typeof f.accounting_system === 'string' ? f.accounting_system : null,
    // What our built-in schedule will auto-create (accurate for this entity).
    system_auto_schedule: systemFilings,
    system_templates_cover: 'California state agencies and federal IRS filings only',
  }
}

// Never let a flaky/absent model block the flow — compose a plain read from facts.
function deterministicBrief(ctx: ReturnType<typeof buildContext>): OnboardingBrief {
  const who = ctx.owners.length ? ` owned by ${ctx.owners.join(' and ')}` : ''
  const what = ctx.business_activity ? ` It ${ctx.business_activity.replace(/\.$/, '')}.` : ''
  const since = ctx.started ? `, operating since ${ctx.started}` : ''
  const read = `${ctx.name} is ${ctx.entity_type ? `a ${ctx.entity_type}` : 'a business'}${ctx.home_state ? ` based in ${ctx.home_state}` : ''}${since}${who}.${what}`.replace(/\s+/g, ' ').trim()
  const sys = ctx.system_auto_schedule.length ? ` I'll stay ahead of ${ctx.system_auto_schedule.join(', ')}.` : ''
  // Deterministic mode can't know each state's specifics — just flag that its
  // home-state filings need setting up rather than naming the wrong state's.
  const stateNote = !ctx.is_california && ctx.home_state ? ` I'll also set up ${ctx.home_state}'s state filings for this entity.` : ''
  const handling = `I'll keep the books on a ${ctx.accounting_basis} basis${ctx.accounting_system ? `, migrating from ${ctx.accounting_system}` : ''}.${sys}${stateNote}`.trim()
  return { read, handling }
}

// Generate (and persist) the Overseer's opening read for the review step.
export async function brief(sessionId: string): Promise<OnboardingBrief> {
  const viewer = await requireAdmin()
  const admin = createAdminClient()
  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, org_id, account_name, overseer_read, overseer_handling')
    .eq('id', sessionId)
    .single()
  if (!session || !canUseFirm(viewer, session.org_id as string)) {
    return { read: '', handling: '' }
  }

  const { data: facts } = await admin.from('onboarding_facts').select('key, normalized_value').eq('session_id', sessionId)
  const f: Record<string, unknown> = {}
  for (const row of facts ?? []) f[row.key as string] = row.normalized_value
  const ctx = buildContext(session.account_name as string, f)

  let out: OnboardingBrief
  try {
    out = await onboardingBrief(ctx, viewer.locale)
  } catch {
    out = deterministicBrief(ctx)
  }
  if (!out.read && !out.handling) out = deterministicBrief(ctx)

  await admin
    .from('onboarding_sessions')
    .update({ overseer_read: out.read, overseer_handling: out.handling, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  return out
}

// Validate the model's proposed fact corrections into normalized fact values.
const HAS_EMP = new Set(['yes', 'no', 'not_yet', 'not_sure'])
function applyUpdates(u: OnboardingRevision['updates']): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (typeof u.entity_type === 'string') {
    const et = normalizeEntityType(u.entity_type)
    if (et) out.entity_type = et
  }
  if (typeof u.state === 'string' && u.state.trim()) {
    const s = u.state.trim()
    out.state = s.length <= 3 ? s.toUpperCase() : s
  }
  if (typeof u.formation_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(u.formation_date)) out.formation_date = u.formation_date
  if (typeof u.business_activity === 'string' && u.business_activity.trim()) out.business_activity = u.business_activity.trim()
  if (typeof u.has_employees === 'string' && HAS_EMP.has(u.has_employees)) out.has_employees = u.has_employees
  if (u.accounting_basis === 'cash' || u.accounting_basis === 'accrual') out.accounting_basis = u.accounting_basis
  if (typeof u.accounting_system === 'string' && u.accounting_system.trim()) out.accounting_system = u.accounting_system.trim()
  if (Array.isArray(u.owners)) {
    const owners = u.owners
      .filter((o) => o && typeof o.name === 'string' && o.name.trim())
      .map((o) => ({ name: o.name.trim(), pct: typeof o.pct === 'number' ? o.pct : null }))
    if (owners.length) out.owners = owners
  }
  return out
}

export type RespondResult =
  | { acknowledgment: string; read: string; handling: string; facts: Record<string, unknown> }
  | { error: string }

// The operator replies to the Overseer's read on the review step. The Overseer
// acknowledges, corrects any facts it got wrong, and rewrites its read.
export async function respond(sessionId: string, message: string): Promise<RespondResult> {
  const viewer = await requireAdmin()
  const clean = message.trim()
  if (!clean) return { error: 'Type a message first.' }
  const admin = createAdminClient()
  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, org_id, account_name, overseer_read, overseer_handling')
    .eq('id', sessionId)
    .single()
  if (!session || !canUseFirm(viewer, session.org_id as string)) return { error: 'This onboarding session is unavailable.' }

  const { data: factRows } = await admin.from('onboarding_facts').select('key, normalized_value').eq('session_id', sessionId)
  const f: Record<string, unknown> = {}
  for (const row of factRows ?? []) f[row.key as string] = row.normalized_value

  const ctx = buildContext(session.account_name as string, f)
  let rev: OnboardingRevision
  try {
    rev = await reviseOnboarding(ctx, clean, viewer.locale)
  } catch {
    return {
      acknowledgment: 'I couldn’t process that just now — you can go Back to edit any answer directly.',
      read: (session.overseer_read as string) ?? '',
      handling: (session.overseer_handling as string) ?? '',
      facts: f,
    }
  }

  // Apply and persist any corrected facts.
  const applied = applyUpdates(rev.updates)
  for (const [key, val] of Object.entries(applied)) {
    await admin.from('onboarding_facts').upsert(
      { session_id: sessionId, key, raw_value: '', normalized_value: val, source: 'user', confirmed: true },
      { onConflict: 'session_id,key' }
    )
    f[key] = val
  }

  const read = rev.read || (session.overseer_read as string) || ''
  const handling = rev.handling || (session.overseer_handling as string) || ''
  await admin
    .from('onboarding_sessions')
    .update({ overseer_read: read, overseer_handling: handling, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  return { acknowledgment: rev.acknowledgment || 'Updated.', read, handling, facts: f }
}

// Turn the session into a real account and go to its books.
export async function materialize(sessionId: string): Promise<{ error: string } | void> {
  const viewer = await requireAdmin()
  const admin = createAdminClient()

  const { data: session } = await admin
    .from('onboarding_sessions')
    .select('id, org_id, account_name, status, overseer_read, overseer_handling')
    .eq('id', sessionId)
    .single()
  if (!session) return { error: 'This onboarding session no longer exists.' }
  if (!canUseFirm(viewer, session.org_id as string)) return { error: 'You can’t create an account in this firm.' }
  if (session.status === 'completed') return { error: 'This account was already created.' }

  const { data: facts } = await admin.from('onboarding_facts').select('key, normalized_value').eq('session_id', sessionId)
  const f: Record<string, unknown> = {}
  for (const row of facts ?? []) f[row.key as string] = row.normalized_value

  const result = await createAccount(admin, {
    orgId: session.org_id as string,
    name: session.account_name as string,
    entityType: normalizeEntityType(f.entity_type),
    entitySubtype: typeof f.entity_subtype === 'string' && f.entity_subtype ? f.entity_subtype : null,
    accountingMethod: f.accounting_basis === 'accrual' ? 'accrual' : 'cash',
    owners: (Array.isArray(f.owners) ? (f.owners as Owner[]) : []).filter((o) => o && o.name),
    hasEmployees: f.has_employees === 'yes',
    state: typeof f.state === 'string' ? f.state : null,
    businessActivity: typeof f.business_activity === 'string' ? f.business_activity : null,
    accountingSystem: typeof f.accounting_system === 'string' ? f.accounting_system : null,
    formationDate: typeof f.formation_date === 'string' && f.formation_date ? f.formation_date : null,
    taxYear: typeof f.tax_year === 'string' && /^\d{4}$/.test(f.tax_year) ? Number(f.tax_year) : null,
    overseerRead: (session.overseer_read as string | null) ?? null,
    overseerHandling: (session.overseer_handling as string | null) ?? null,
    createdBy: viewer.userId,
    createdByEmail: viewer.email,
  })
  if ('error' in result) return { error: result.error }

  await admin
    .from('onboarding_sessions')
    .update({ status: 'completed', client_id: result.clientId, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  revalidatePath('/admin')
  redirect(`/admin/clients/${result.slug}?ok=${encodeURIComponent(ob(viewer.locale, 'created.ok'))}`)
}

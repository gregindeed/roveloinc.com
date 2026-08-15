'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionPortalLogin } from '@/lib/portal'
import { getViewer } from '@/lib/auth'
import { CHART_TEMPLATES, DEFAULT_TEMPLATE_KEY } from '@/lib/coa'
import { logEvent } from '@/lib/registryServer'
import type { createClient as createServerClient } from '@/lib/supabase/server'

/** Base URL of the current deployment, derived from the request. */
function siteUrl() {
  const host = headers().get('host') ?? 'localhost:3001'
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${proto}://${host}`
}

/** Verify the caller is a signed-in admin. Redirects away if not. */
async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/portal')
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fail(message: string): never {
  redirect(`/admin/new?error=${encodeURIComponent(message)}`)
}

const VALID_TEMPLATES = new Set(Object.keys(CHART_TEMPLATES))

export async function createClientAccount(formData: FormData) {
  await requireAdmin()

  const name = String(formData.get('name') || '').trim()
  const slug = slugify(String(formData.get('slug') || '') || name)
  const address = String(formData.get('address') || '').trim() || null

  // Owners: paired owner_name / owner_pct inputs (blank rows dropped).
  const ownerNames = formData.getAll('owner_name').map((v) => String(v).trim())
  const ownerPcts = formData.getAll('owner_pct').map((v) => String(v).trim())
  const owners = ownerNames
    .map((n, i) => ({ name: n, pct: ownerPcts[i] ? Number(ownerPcts[i]) : null }))
    .filter((o) => o.name)
  const primaryOwner = owners[0]?.name ?? null
  const email = String(formData.get('email') || '').trim() // optional — portal login can be added later
  const entityType = String(formData.get('entity_type') || '').trim() || null
  const basis = String(formData.get('accounting_method') || 'cash').trim() // default cash
  const templateKey = String(formData.get('template') || DEFAULT_TEMPLATE_KEY).trim()

  if (!name) fail('Business name is required.')
  if (!slug) fail('A URL slug is required.')

  // Which firm this client belongs to. A platform super-admin may pick any firm;
  // a firm's own admin can only create clients within their firm.
  const viewer = await getViewer()
  let orgId = viewer?.orgId ?? null
  if (viewer?.isPlatform) {
    const chosen = String(formData.get('org_id') || '').trim()
    if (chosen) orgId = chosen
  }

  const base = siteUrl()
  const admin = createAdminClient()

  // 1) Create the tenant with how-they-operate defaults.
  const { data: client, error: cErr } = await admin
    .from('clients')
    .insert({
      name,
      slug,
      org_id: orgId,
      owner_name: primaryOwner,
      address,
      entity_type: entityType,
      accounting_method: basis === 'accrual' ? 'accrual' : 'cash',
    })
    .select('id, slug, name')
    .single()
  if (cErr) {
    if (cErr.code === '23505') fail(`The slug "${slug}" is already in use. Pick another.`)
    fail(`Could not create client: ${cErr.message}`)
  }

  // Create an officer row per owner (with % where given).
  if (owners.length > 0) {
    await admin.from('entity_officers').insert(
      owners.map((o) => ({ client_id: client!.id, name: o.name, title: 'Owner', ownership_pct: o.pct }))
    )
  }

  // 2) Seed the chart of accounts from the chosen template (default general).
  const template = CHART_TEMPLATES[VALID_TEMPLATES.has(templateKey) ? templateKey : DEFAULT_TEMPLATE_KEY]
  await admin.from('chart_of_accounts').insert(
    template.accounts.map((a, i) => ({
      client_id: client!.id,
      code: a.code,
      name: a.name,
      type: a.type,
      tax_line: a.tax_line ?? null,
      sort: i,
    }))
  )

  // Genesis: the first line of the entity's registry — where its record begins.
  await logEvent(admin as unknown as ReturnType<typeof createServerClient>, client!.id, {
    kind: 'genesis',
    source: 'system',
    actor: 'System',
    title: `Welcome, ${name}. This is the start of your record on Rovelo Inc.`,
    detail: `${entityType ?? 'Business type not set yet'} · ${basis === 'accrual' ? 'accrual' : 'cash'} basis.`,
  })

  // 3) Portal login is OPTIONAL. If no email was given, create the entity now
  //    and invite them later from settings.
  if (!email) {
    revalidatePath('/admin')
    redirect(
      `/admin/clients/${client!.slug}?ok=${encodeURIComponent(
        'Client created. No portal email yet — you can invite them anytime from Entity settings → Portal access.'
      )}`
    )
  }

  // 4) Provision the portal login + invite email. Roll back the tenant on failure.
  const res = await provisionPortalLogin(client!.id, client!.name, email, base)
  if (!res.ok) {
    await admin.from('clients').delete().eq('id', client!.id) // cascades chart_of_accounts
    fail(res.error)
  }

  revalidatePath('/admin')
  redirect(`/admin/clients/${client!.slug}?ok=${encodeURIComponent(`Client created and an invite was emailed to ${email}.`)}`)
}

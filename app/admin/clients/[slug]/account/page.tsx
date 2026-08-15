import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import EntityInfoSheet from '@/components/EntityInfoSheet'
import EntityPrintDoc from '@/components/EntityPrintDoc'
import PrintSheetMode from '@/components/PrintSheetMode'
import { addOfficer, deleteOfficer, setIncomeModel } from '@/app/admin/clients/[slug]/edit/actions'
import DocumentsPanel from '@/components/DocumentsPanel'
import ComplianceProfile from '@/components/ComplianceProfile'
import EntityAccessPanel from '@/components/EntityAccessPanel'
import ChartOfAccounts from '@/components/ChartOfAccounts'
import BankFeed, { type BankConnection } from '@/components/BankFeed'
import PortalAccessPanel from '@/components/PortalAccessPanel'
import LifecyclePanel from '@/components/LifecyclePanel'
import ReviewQueue from '@/components/ReviewQueue'
import SettingsShell from '@/components/SettingsShell'
import { getViewer } from '@/lib/auth'
import { PERMANENT_FOLDER } from '@/lib/folders'
import { PROFILE_FIELDS } from '@/lib/compliance'
import { suggestedTemplateKey } from '@/lib/coa'
import { getChartOfAccounts } from '@/lib/coaServer'
import type { Client, Officer, DocumentRow, Organization, FieldReview } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { ok?: string; warn?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const viewer = await getViewer()
  const { data } = await supabase.from('clients').select('*').eq('slug', params.slug).single()
  if (!data) notFound()
  const c = data as Client

  const [{ data: officers }, { data: permanentDocs }, accounts, { data: reviews }] =
    await Promise.all([
    supabase.from('entity_officers').select('*').eq('client_id', c.id).order('created_at'),
    supabase
      .from('documents')
      .select('*')
      .eq('client_id', c.id)
      .eq('folder', PERMANENT_FOLDER)
      .order('created_at', { ascending: false }),
    // Chart of accounts — cached (tag-invalidated on edits), shared across tabs.
    getChartOfAccounts(c.id),
    supabase
      .from('field_reviews')
      .select('*')
      .eq('client_id', c.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  // Owner-only: who (external collaborators) can work on this entity.
  // Managers (admin role): the portal login state for this entity.
  let collaborators: { id: string; email: string }[] = []
  let portalEmail: string | null = null
  let firms: Organization[] = []
  const isManager = viewer?.role === 'admin'

  // Platform admins can transfer this client between firms — load the roster.
  if (viewer?.isPlatform) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('*')
      .order('is_platform', { ascending: false })
      .order('name')
    firms = (orgs ?? []) as Organization[]
  }
  if (viewer?.isOwner || isManager) {
    const admin = createAdminClient()
    const { data: userList } = await admin.auth.admin.listUsers()
    const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '(no email)']))

    if (viewer?.isOwner) {
      const { data: grants } = await admin.from('entity_access').select('user_id').eq('client_id', c.id)
      collaborators = (grants ?? []).map((g) => ({ id: g.user_id, email: emailById.get(g.user_id) ?? '(unknown)' }))
    }

    const { data: portalProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('client_id', c.id)
      .eq('role', 'client')
      .maybeSingle()
    if (portalProfile?.id) portalEmail = emailById.get(portalProfile.id) ?? '(unknown)'
  }

  // Bank feed connections for the settings "Bank feed" section. Read with the
  // service role but expose ONLY safe columns (never the access token) to the UI,
  // exactly as the Statements tab does.
  const plaidConfigured = !!process.env.PLAID_CLIENT_ID
  let bankConnections: BankConnection[] = []
  {
    const admin = createAdminClient()
    const { data: conns } = await admin
      .from('plaid_items')
      .select('id, institution_name, last_synced_at, status')
      .eq('client_id', c.id)
      .order('created_at', { ascending: false })
    bankConnections = (conns ?? []) as BankConnection[]
  }

  return (
    <div className="space-y-4">
      <PrintSheetMode />
      {searchParams.ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
          {searchParams.ok}
        </div>
      )}
      {searchParams.warn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {searchParams.warn}
        </div>
      )}
      <div>
        <Link href={`/admin/clients/${c.slug}`} className="text-xs text-gray-500 hover:text-gray-900">
          ← {c.name}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Entity settings</h1>
      </div>

      {(isManager || viewer?.isOwner) && (
        <ReviewQueue slug={c.slug} reviews={(reviews ?? []) as FieldReview[]} />
      )}

      <SettingsShell
        sections={[
          {
            key: 'profile',
            label: 'Profile',
            content: (
              <div id="entity-sheet">
                <div className="no-print space-y-5">
                <EntityInfoSheet
                  slug={c.slug}
                  entityName={c.name}
                  data={c as unknown as Record<string, string | number | null>}
                  canEdit={isManager || !!viewer?.isOwner}
                />
                <div className="sheet-block border border-gray-200 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">Officers &amp; ownership</h2>
                  {(officers ?? []).length > 0 ? (
                    <div className="divide-y divide-gray-100 mb-3">
                      {(officers as Officer[]).map((o) => (
                        <div key={o.id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-900">{o.name}</span>
                            {o.title && <span className="text-gray-500"> · {o.title}</span>}
                            {o.ownership_pct != null && <span className="text-gray-500"> · {o.ownership_pct}%</span>}
                          </div>
                          <form action={deleteOfficer.bind(null, c.slug, o.id)} className="no-print">
                            <button className="text-xs text-red-600 hover:text-red-700">Remove</button>
                          </form>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mb-3">None added yet.</p>
                  )}
                  <form action={addOfficer.bind(null, c.slug)} className="no-print flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                    <input name="name" required placeholder="Name" className="w-40 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <input name="title" placeholder="Title" className="w-40 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <input name="ownership_pct" type="number" placeholder="%" className="w-20 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <button className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">Add</button>
                  </form>
                </div>

                </div>

                <EntityPrintDoc
                  c={c}
                  officers={(officers ?? []) as Officer[]}
                  generatedOn={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                />
              </div>
            ),
          },
          {
            key: 'compliance',
            label: 'Compliance',
            content: (
              <ComplianceProfile
                slug={c.slug}
                profile={Object.fromEntries(
                  PROFILE_FIELDS.map((f) => [f, !!(c as unknown as Record<string, boolean>)[f]])
                )}
              />
            ),
          },
          {
            key: 'income_model',
            label: 'Income tracking',
            content: (
              <div className="border border-gray-200 rounded-xl p-5 max-w-2xl">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">How this entity records revenue</h2>
                <p className="text-xs text-gray-500 mb-4">
                  <strong>Simple income</strong> — the bank deposits are the record; categorize each deposit to a revenue
                  account (rent, freight, service fees). Most services, rentals, and trades.{' '}
                  <strong>Sales journal</strong> — adds a sales subledger that reconciles a register/POS against the bank,
                  for businesses that make sales (retail, restaurants, cash trades).
                </p>
                <form action={setIncomeModel.bind(null, c.slug)} className="flex flex-wrap items-center gap-2">
                  <select
                    name="income_model"
                    defaultValue={c.income_model ?? 'simple'}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="simple">Simple income — bank deposits are the record</option>
                    <option value="sales">Sales journal — register/POS reconciled to bank</option>
                  </select>
                  <button className="rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800">
                    Save
                  </button>
                </form>
                <p className="text-xs text-gray-400 mt-3">
                  Reversible and non-destructive — this only shows or hides the Sales journal and Reconcile tabs and how
                  revenue is recorded. It never deletes data.
                </p>
              </div>
            ),
          },
          {
            key: 'reports',
            label: 'Reports',
            content: (
              <div className="border border-gray-200 rounded-xl p-5 max-w-2xl">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Financial reports &amp; exports</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Profit &amp; loss, income and expense detail, financial position, and CSV exports for this entity.
                </p>
                <Link
                  href={`/admin/clients/${c.slug}/reports`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800"
                >
                  Open reports →
                </Link>
              </div>
            ),
          },
          {
            key: 'coa',
            label: 'Chart of accounts',
            content: (
              <ChartOfAccounts
                slug={c.slug}
                accounts={accounts}
                suggestedTemplate={suggestedTemplateKey(c.entity_type, c.naics_code)}
              />
            ),
          },
          {
            key: 'bank',
            label: 'Bank feed',
            content: (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Bank &amp; card connections</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Connect the entity&apos;s bank or card accounts so transactions flow in automatically. You can also do
                  this from the Statements tab — both create the same secure connection.
                </p>
                <BankFeed slug={c.slug} connections={bankConnections} configured={plaidConfigured} />
              </div>
            ),
          },
          {
            key: 'documents',
            label: 'Permanent file',
            content: (
              <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Formation &amp; Legal documents</h2>
                <p className="text-xs text-gray-500 mb-3">
                  Articles, EIN letter, Statement of Information, licenses, agreements — these stay with the entity and
                  aren&apos;t tied to a year.
                </p>
                <DocumentsPanel
                  clientId={c.id}
                  currentUserId={user!.id}
                  isAdmin={true}
                  initialDocs={(permanentDocs ?? []) as DocumentRow[]}
                  title="Permanent file"
                  folder={PERMANENT_FOLDER}
                />
              </div>
            ),
          },
          ...(isManager
            ? [
                {
                  key: 'portal',
                  label: 'Portal access',
                  content: <PortalAccessPanel slug={c.slug} entityName={c.name} portalEmail={portalEmail} />,
                },
              ]
            : []),
          ...(viewer?.isOwner
            ? [
                {
                  key: 'access',
                  label: 'Collaborators',
                  content: <EntityAccessPanel slug={c.slug} entityName={c.name} collaborators={collaborators} />,
                },
              ]
            : []),
          ...(isManager || viewer?.isOwner
            ? [
                {
                  key: 'lifecycle',
                  label: 'Lifecycle',
                  content: <LifecyclePanel c={c} isPlatform={!!viewer?.isPlatform} firms={firms} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}

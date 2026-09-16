import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import ImportWizard from '@/components/ImportWizard'
import { getViewer } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createLead, bulkImport } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add lead — Rovelo Inc', robots: { index: false, follow: false } }

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1'
const input =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

export default async function NewLeadPage({ searchParams }: { searchParams: { org?: string; error?: string } }) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin' && viewer.role !== 'collaborator') redirect('/portal')
  const locale = getLocale()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={viewer.email} settingsHref={null} />
      <main className="max-w-xl mx-auto px-6 py-10">
        <Link href="/admin?tab=leads" className="text-xs text-gray-500 hover:text-gray-900">
          ← Leads
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          {t(locale, 'admin.addLead')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          A prospective account. Just the basics for now — you can flesh it out or convert it to a full account later.
        </p>

        {searchParams.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{searchParams.error}</div>
        )}

        {/* Simple lead form */}
        <form action={createLead} className="mt-6 grid grid-cols-2 gap-3">
          {searchParams.org && <input type="hidden" name="org" value={searchParams.org} />}
          <input type="hidden" name="source" value="manual" />
          <div className="col-span-2">
            <label className={label} htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Acme LLC or Jane Doe" className={input} />
            <p className="mt-1 text-[11px] text-gray-400">The business name, or the person&apos;s name for an individual.</p>
          </div>
          <div>
            <label className={label} htmlFor="kind">Type</label>
            <select id="kind" name="kind" defaultValue="business" className={input}>
              <option value="business">Business</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="contact_name">Contact name</label>
            <input id="contact_name" name="contact_name" placeholder="Who to reach" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className={input} />
          </div>
          <div className="col-span-2">
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700">
              {t(locale, 'admin.addLead')}
            </button>
          </div>
        </form>

        {/* Or bring in many at once */}
        <div className="mt-10 border-t border-gray-100 pt-8">
          <h2 className="text-sm font-semibold text-gray-900">Import a list of leads</h2>
          <p className="mt-0.5 mb-4 text-xs text-gray-500">Paste rows or upload a CSV — map the columns and they come in as leads.</p>
          <ImportWizard onImport={bulkImport} canCreateAccounts={false} lockDestination="leads" />
        </div>
      </main>
    </div>
  )
}

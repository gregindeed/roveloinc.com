import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import ImportWizard from '@/components/ImportWizard'
import { getViewer } from '@/lib/auth'
import { bulkImport } from '../leads/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Import data — Rovelo Inc', robots: { index: false, follow: false } }

export default async function ImportPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.role !== 'admin' && viewer.role !== 'collaborator') redirect('/portal')
  const canCreateAccounts = viewer.role === 'admin'

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={viewer.email} settingsHref={null} />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          Import data
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Bring in an existing list in one pass — paste rows or upload a CSV, map the columns, and choose where they land:
          as <strong>leads</strong> to review, or as live <strong>accounts</strong>. Great for migrating off another system
          without onboarding one by one.
        </p>

        <div className="mt-6">
          <ImportWizard onImport={bulkImport} canCreateAccounts={canCreateAccounts} />
        </div>
      </main>
    </div>
  )
}

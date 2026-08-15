import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { requirePlatform } from '@/lib/auth'
import { onboardFirm } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Onboard a firm — Rovelo Inc', robots: { index: false, follow: false } }

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

export default async function OnboardFirm({ searchParams }: { searchParams: { error?: string } }) {
  await requirePlatform()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref="/admin/team" />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/admin/firms" className="text-xs text-gray-500 hover:text-gray-900">
          ← Firms
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">Bring a partner firm onto Rovelo</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">
          You&apos;re partnering with this firm to manage their accounts&apos; books. This sets them up with their own
          walled workspace on the platform and invites their first accountant-manager — one step, and they&apos;re live.
        </p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={onboardFirm} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">The firm</legend>
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
                Firm name <span className="text-red-500">*</span>
              </label>
              <input id="name" name="name" required placeholder="e.g. Hummingbird Financial Service" className={inputCls} />
            </div>
            <div>
              <label htmlFor="notes" className="block text-xs font-medium text-gray-700 mb-1">
                About this partnership <span className="font-normal normal-case text-gray-400">· optional</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="What this engagement covers — the kind of accounts they bring, how you split the work, anything worth remembering."
                className={inputCls}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Their first manager <span className="font-normal normal-case text-gray-400">· optional</span>
            </legend>
            <div>
              <label htmlFor="manager_email" className="block text-xs font-medium text-gray-700 mb-1">
                Accountant-manager email
              </label>
              <input id="manager_email" name="manager_email" type="email" placeholder="manager@firm.com" className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">
                We&apos;ll email them an invite to set a password. They&apos;ll see only their own firm&apos;s clients. Leave
                blank to invite managers later.
              </p>
            </div>
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
            >
              Onboard firm
            </button>
            <Link href="/admin/firms" className="text-sm text-gray-500 hover:text-gray-900">
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

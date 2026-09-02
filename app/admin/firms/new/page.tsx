import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthHeader from '@/components/AuthHeader'
import { requirePlatform } from '@/lib/auth'
import { onboardFirm } from '../actions'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Onboard a firm — Rovelo Inc', robots: { index: false, follow: false } }

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

export default async function OnboardFirm({ searchParams }: { searchParams: { error?: string } }) {
  await requirePlatform()
  const locale = getLocale()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Admin" email={user?.email} settingsHref="/admin/team" />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <Link href="/admin/firms" className="text-xs text-gray-500 hover:text-gray-900">
          ← {t(locale, 'team.firms')}
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-4">{t(locale, 'team.onboardTitle')}</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">{t(locale, 'team.onboardIntro')}</p>

        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={onboardFirm} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t(locale, 'team.theFirm')}</legend>
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
                {t(locale, 'team.firmName')} <span className="text-red-500">*</span>
              </label>
              <input id="name" name="name" required placeholder={t(locale, 'team.firmNamePlaceholder')} className={inputCls} />
            </div>
            <div>
              <label htmlFor="notes" className="block text-xs font-medium text-gray-700 mb-1">
                {t(locale, 'team.aboutPartnership')} <span className="font-normal normal-case text-gray-400">{t(locale, 'team.optional')}</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder={t(locale, 'team.partnershipNotesPlaceholder')}
                className={inputCls}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              {t(locale, 'team.theirFirstManager')} <span className="font-normal normal-case text-gray-400">{t(locale, 'team.optional')}</span>
            </legend>
            <div>
              <label htmlFor="manager_email" className="block text-xs font-medium text-gray-700 mb-1">
                {t(locale, 'team.accountantManagerEmail')}
              </label>
              <input id="manager_email" name="manager_email" type="email" placeholder="manager@firm.com" className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">{t(locale, 'team.managerInviteHint')}</p>
            </div>
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
            >
              {t(locale, 'team.onboardFirm')}
            </button>
            <Link href="/admin/firms" className="text-sm text-gray-500 hover:text-gray-900">
              {t(locale, 'team.cancel')}
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

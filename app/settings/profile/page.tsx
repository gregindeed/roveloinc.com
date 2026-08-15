import Link from 'next/link'
import { redirect } from 'next/navigation'
import AuthHeader from '@/components/AuthHeader'
import { getViewer } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import ProfileForm from './ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your profile — Rovelo Inc', robots: { index: false, follow: false } }

export default async function ProfileSettings({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const locale = getLocale()

  // Where "back" goes depends on which side of the app they live on.
  const home = viewer.role === 'client' ? '/portal' : '/admin'

  return (
    <div className="min-h-screen bg-white">
      <AuthHeader label="Settings" email={viewer.email} />
      <main className="max-w-lg mx-auto px-6 py-10">
        <Link href={home} className="text-xs text-gray-500 hover:text-gray-900">
          ← {t(locale, 'common.back')}
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mt-4 mb-1" style={{ fontFamily: 'var(--font-fraunces), serif' }}>
          {t(locale, 'profile.title')}
        </h1>
        <p className="text-sm text-gray-500 mb-6">{t(locale, 'profile.subtitle')}</p>

        {searchParams.ok && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            {searchParams.ok}
          </div>
        )}
        {searchParams.error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <ProfileForm email={viewer.email} initialName={viewer.displayName} avatarUrl={viewer.avatarUrl} />
      </main>
    </div>
  )
}

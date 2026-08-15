import Link from 'next/link'
import SignOutButton from './SignOutButton'
import Avatar from './Avatar'
import PresenceHeartbeat from './PresenceHeartbeat'
import LanguageSwitch from './LanguageSwitch'
import { getViewer } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export default async function AuthHeader({
  label,
  email,
  settingsHref,
  actions,
  presenceClientId,
}: {
  label: string
  email?: string | null
  settingsHref?: string | null
  actions?: React.ReactNode
  // The entity the user is currently viewing, if any — reported with the heartbeat.
  presenceClientId?: string | null
}) {
  const viewer = await getViewer()
  const locale = getLocale()
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span
            className="text-lg text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
          <span className="text-xs font-medium text-gray-500 tracking-wide ml-1">{label}</span>
        </Link>
        <div className="flex items-center gap-3">
          {viewer && <PresenceHeartbeat clientId={presenceClientId ?? null} />}
          {actions}
          {actions && <span className="h-5 w-px bg-gray-200 hidden sm:inline-block" />}
          {email && <span className="text-xs text-gray-500 hidden sm:inline">{email}</span>}
          {viewer && <LanguageSwitch />}
          {viewer && (
            <Link
              href="/settings/profile"
              title={t(locale, 'nav.profile')}
              aria-label={t(locale, 'nav.profile')}
              className="rounded-full hover:ring-2 hover:ring-gray-200 transition-all"
            >
              <Avatar name={viewer.displayName || viewer.email} email={viewer.email} url={viewer.avatarUrl} size={28} />
            </Link>
          )}
          {settingsHref && (
            <Link
              href={settingsHref}
              title={t(locale, 'nav.settings')}
              aria-label={t(locale, 'nav.settings')}
              className="flex items-center justify-center h-8 w-8 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

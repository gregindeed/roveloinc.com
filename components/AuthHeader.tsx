import Link from 'next/link'
import Avatar from './Avatar'
import PresenceHeartbeat from './PresenceHeartbeat'
import LanguageSwitch from './LanguageSwitch'
import NotificationsBell from './NotificationsBell'
import UserMenu from './UserMenu'
import { getViewer } from '@/lib/auth'
import { defaultHandle } from '@/lib/avatar'

export default async function AuthHeader({
  label,
  // Kept for call-site compatibility; the header now reads identity from the
  // viewer directly (handle-first) rather than showing a raw email in the bar.
  email: _email,
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

  // Where the wordmark takes a signed-in user: their own dashboard, not the
  // public marketing homepage. Workers land on /admin, clients on /portal.
  const isWorker = viewer?.role === 'admin' || viewer?.role === 'collaborator'
  const homeHref = viewer ? (isWorker ? '/admin' : '/portal') : '/'

  const handle = viewer
    ? defaultHandle({ handle: viewer.handle, displayName: viewer.displayName, email: viewer.email })
    : ''
  const menuName = viewer?.displayName || (handle ? `@${handle}` : viewer?.email || 'You')

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href={homeHref} className="flex items-baseline gap-2.5">
          <span
            className="text-lg text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
          <span className="text-xs font-medium text-gray-500 tracking-wide ml-1">{label}</span>
        </Link>
        <div className="flex items-center gap-2">
          {viewer && <PresenceHeartbeat clientId={presenceClientId ?? null} />}
          {actions}
          {actions && <span className="h-5 w-px bg-gray-200 hidden sm:inline-block mx-1" />}
          {viewer && <NotificationsBell />}
          {viewer && <LanguageSwitch />}
          {viewer ? (
            <UserMenu
              name={menuName}
              handle={handle}
              email={viewer.email}
              avatarUrl={viewer.avatarUrl}
              settingsHref={settingsHref ?? null}
            />
          ) : (
            settingsHref && (
              <Link
                href={settingsHref}
                className="flex items-center justify-center h-8 w-8 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Avatar name="User" size={28} />
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  )
}

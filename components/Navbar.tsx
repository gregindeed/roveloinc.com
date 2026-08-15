import Link from 'next/link'
import { getViewer } from '@/lib/auth'

export default async function Navbar() {
  const viewer = await getViewer()
  const isWorker = viewer?.role === 'admin' || viewer?.role === 'collaborator'
  const dashHref = viewer ? (isWorker ? '/admin' : '/portal') : null

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-baseline gap-2.5">
          <span
            className="text-lg text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
          <span className="text-xs font-medium text-gray-500 tracking-wide hidden sm:inline">Business Advisory &amp; Solutions</span>
        </a>
        {viewer ? (
          <Link
            href={dashHref!}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Client Login
          </Link>
        )}
      </div>
    </header>
  )
}

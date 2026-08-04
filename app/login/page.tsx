import Link from 'next/link'
import { login } from './actions'

export const metadata = {
  title: 'Sign in — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string }
}) {
  const error = searchParams.error
  const next = searchParams.next ?? ''

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-baseline gap-2 justify-center mb-8">
          <span className="text-xl font-bold tracking-tight text-gray-900">Rovelo</span>
          <span
            className="text-xl font-normal text-gray-400"
            style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic' }}
          >
            Inc.
          </span>
        </Link>

        <h1 className="text-lg font-semibold text-gray-900 text-center">Client &amp; Admin Portal</h1>
        <p className="text-sm text-gray-600 text-center mt-1 mb-6">Sign in to view your books.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-800 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          Trouble signing in? Contact Rovelo Inc.
        </p>
      </div>
    </div>
  )
}

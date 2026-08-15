import { setPassword } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Set your password — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default function SetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-center mb-8">
          <span
            className="text-2xl text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
        </div>

        <h1 className="text-lg font-semibold text-gray-900 text-center">Set your password</h1>
        <p className="text-sm text-gray-600 text-center mt-1 mb-6">
          Choose a password to finish setting up your portal.
        </p>

        {searchParams.error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <form action={setPassword} className="space-y-3">
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-xs font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
            />
          </div>
          <button
            type="submit"
            className="w-full text-center text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
          >
            Save password &amp; continue
          </button>
        </form>
      </div>
    </div>
  )
}

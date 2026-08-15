import Link from 'next/link'
import { requestPasswordReset } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Reset password — Rovelo Inc',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string }
}) {
  const sent = searchParams.ok === '1'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-baseline justify-center mb-8">
          <span
            className="text-2xl text-gray-900"
            style={{ fontFamily: 'var(--font-fraunces), serif', fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            rovelo<span className="text-gray-400" style={{ fontWeight: 400 }}>.inc</span>
          </span>
        </Link>

        <h1 className="text-lg font-semibold text-gray-900 text-center">Reset your password</h1>

        {sent ? (
          <>
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-800">
              If an account exists for that email, we&apos;ve sent a reset link. Check your inbox (and spam).
            </div>
            <p className="text-xs text-gray-500 text-center mt-6">
              <Link href="/login" className="font-medium text-gray-700 hover:text-gray-900">
                ← Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 text-center mt-1 mb-6">
              Enter your email and we&apos;ll send a link to set a new password.
            </p>

            {searchParams.error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {searchParams.error}
              </div>
            )}

            <form action={requestPasswordReset} className="space-y-3">
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
              <button
                type="submit"
                className="w-full text-center text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
              >
                Send reset link
              </button>
            </form>

            <p className="text-xs text-gray-500 text-center mt-6">
              <Link href="/login" className="font-medium text-gray-700 hover:text-gray-900">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

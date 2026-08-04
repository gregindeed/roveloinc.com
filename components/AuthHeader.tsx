import Link from 'next/link'
import SignOutButton from './SignOutButton'

export default function AuthHeader({ label, email }: { label: string; email?: string | null }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-tight text-gray-900">Rovelo</span>
          <span
            className="text-base font-normal text-gray-400"
            style={{ fontFamily: 'var(--font-vollkorn)', fontStyle: 'italic' }}
          >
            Inc.
          </span>
          <span className="text-xs font-medium text-gray-500 tracking-wide ml-1">{label}</span>
        </Link>
        <div className="flex items-center gap-4">
          {email && <span className="text-xs text-gray-500 hidden sm:inline">{email}</span>}
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

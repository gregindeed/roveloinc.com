'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export default function ClientTabs({ slug }: { slug: string }) {
  const path = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  const base = `/admin/clients/${slug}`
  const tabs = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/transactions`, label: 'Transactions' },
    { href: `${base}/expenses`, label: 'Expenses' },
    { href: `${base}/compliance`, label: 'Compliance' },
    { href: `${base}/documents`, label: 'Documents' },
  ]
  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200 mt-4">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href + qs}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              active
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

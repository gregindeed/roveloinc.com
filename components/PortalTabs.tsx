'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function PortalTabs() {
  const path = usePathname()
  const tabs = [
    { href: '/portal', label: 'Overview', exact: true },
    { href: '/portal/reports', label: 'Reports' },
    { href: '/portal/compliance', label: 'Compliance' },
    { href: '/portal/documents', label: 'Documents' },
    { href: '/portal/settings', label: 'Settings' },
  ]
  return (
    <nav className="flex gap-1 border-b border-gray-200 mt-4">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
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

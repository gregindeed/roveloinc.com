'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useT } from '@/components/I18nProvider'

export default function ClientTabs({ slug, year }: { slug: string; year: number }) {
  const t = useT()
  const path = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  const base = `/admin/clients/${slug}/${year}`
  const tabs = [
    { href: base, label: t('admin.tab.overview'), exact: true },
    { href: `${base}/transactions`, label: t('admin.tab.transactions') },
    { href: `${base}/expenses`, label: t('admin.tab.expenses') },
    { href: `${base}/compliance`, label: t('admin.tab.compliance') },
    { href: `${base}/documents`, label: t('admin.tab.documents') },
  ]
  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200 mt-4">
      {tabs.map((tab) => {
        const active = tab.exact ? path === tab.href : path.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href + qs}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              active
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

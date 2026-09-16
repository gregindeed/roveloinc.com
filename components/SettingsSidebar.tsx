'use client'

import { useState } from 'react'

type SectionKey = 'details' | 'collaborators' | 'danger'

// Settings layout: a left sidebar of sections + the active section's content.
// Each section is server-rendered (its forms keep working) and passed in as a slot.
export default function SettingsSidebar({
  details,
  collaborators,
  danger,
}: {
  details: React.ReactNode
  collaborators: React.ReactNode
  danger: React.ReactNode
}) {
  const [sec, setSec] = useState<SectionKey>('details')

  const items: { key: SectionKey; label: string; danger?: boolean }[] = [
    { key: 'details', label: 'Property details' },
    { key: 'collaborators', label: 'Collaborators' },
    { key: 'danger', label: 'Danger zone', danger: true },
  ]

  const cls = (active: boolean, isDanger?: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
      active
        ? isDanger
          ? 'bg-red-50 font-medium text-red-700'
          : 'bg-gray-100 font-medium text-gray-900'
        : isDanger
          ? 'text-red-600 hover:bg-red-50/60'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`

  const content = sec === 'details' ? details : sec === 'collaborators' ? collaborators : danger

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
      <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-52 sm:flex-col sm:gap-0.5 sm:overflow-visible">
        {items.map((it) => (
          <button key={it.key} type="button" onClick={() => setSec(it.key)} className={cls(sec === it.key, it.danger)}>
            {it.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{content}</div>
    </div>
  )
}

'use client'

import { useState } from 'react'

export type SettingsSection = { key: string; label: string; content: React.ReactNode }

export default function SettingsShell({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.key)
  const current = sections.find((s) => s.key === active) ?? sections[0]

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      <nav className="sm:w-48 shrink-0">
        <ul className="flex sm:flex-col gap-0.5 overflow-x-auto">
          {sections.map((s) => (
            <li key={s.key} className="shrink-0">
              <button
                onClick={() => setActive(s.key)}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  active === s.key ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 min-w-0">{current?.content}</div>
    </div>
  )
}

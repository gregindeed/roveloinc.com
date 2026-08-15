'use client'

import { useTransition } from 'react'
import { setLocale } from '@/app/i18n/actions'
import { useLocale } from './I18nProvider'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n'

// A neat segmented EN|ES toggle for the nav — the active language sits on a white
// pill, the other is a quiet tap target. No harsh fills, matches the clean look.
export default function LanguageSwitch() {
  const locale = useLocale()
  const [pending, start] = useTransition()

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-full bg-gray-100 p-0.5 text-[11px] font-medium ${pending ? 'opacity-60' : ''}`}
    >
      {LOCALES.map((l: Locale) => {
        const active = l === locale
        return (
          <button
            key={l}
            type="button"
            onClick={() => !active && start(() => setLocale(l))}
            aria-pressed={active}
            title={LOCALE_LABELS[l]}
            className={`px-2 py-0.5 rounded-full transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            {l.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

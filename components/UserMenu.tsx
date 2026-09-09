'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { useT } from './I18nProvider'
import Avatar from './Avatar'

// The account menu that lives on the right of the authenticated nav. The avatar
// (with the user's @handle) is the trigger; clicking it reveals a quiet dropdown
// that nests Profile, Settings, and Sign out — so signing out is a deliberate
// two-step act, never a stray click in the open bar.
export default function UserMenu({
  name,
  handle,
  email,
  avatarUrl,
  settingsHref,
}: {
  name: string
  handle: string
  email?: string | null
  avatarUrl?: string | null
  settingsHref?: string | null
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape — expected behaviour for a menu.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemCls =
    'flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors text-left'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-0.5 hover:bg-gray-100 transition-colors"
      >
        <span className="text-xs font-medium text-gray-600 hidden sm:inline">@{handle}</span>
        <Avatar name={name} email={email} url={avatarUrl} size={28} />
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-50"
        >
          <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100">
            <Avatar name={name} email={email} url={avatarUrl} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
              <div className="text-xs text-gray-500 truncate">@{handle}</div>
              {email && <div className="text-[11px] text-gray-400 truncate">{email}</div>}
            </div>
          </div>

          <div className="py-1">
            <Link href="/settings/profile" role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" strokeLinecap="round" />
              </svg>
              {t('nav.profile')}
            </Link>

            {settingsHref && (
              <Link href={settingsHref} role="menuitem" className={itemCls} onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                {t('nav.settings')}
              </Link>
            )}
          </div>

          <div className="border-t border-gray-100 py-1">
            <form action={signOut}>
              <button type="submit" role="menuitem" className={`${itemCls} text-gray-600`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M15 17l5-5-5-5M20 12H9M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('nav.signOut')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

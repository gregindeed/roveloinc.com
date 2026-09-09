'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from './I18nProvider'

// A notification item as the UI expects it. This is the shape a real feed
// (Supabase `notifications` table, or a server action) should hand back.
export type NavNotification = {
  id: string
  title: string
  body?: string | null
  href?: string | null
  // ISO timestamp — used only for ordering/relative display.
  createdAt?: string | null
  read?: boolean
}

// The nav bell. It renders whatever notifications it's given and shows an
// unread count badge; with none it shows a tidy empty state. Today it's a
// scaffold (callers pass []), ready to be wired to a real feed later without
// touching the nav layout.
export default function NotificationsBell({ items = [] as NavNotification[] }: { items?: NavNotification[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !n.read).length

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.notifications')}
        title={t('nav.notifications')}
        className="relative flex items-center justify-center h-8 w-8 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-50"
        >
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-900">{t('nav.notifications')}</div>
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-xs text-gray-500">{t('notifications.empty')}</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((n) => {
                const inner = (
                  <div className="flex gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-rose-500'}`} />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800 truncate">{n.title}</div>
                      {n.body && <div className="text-xs text-gray-500 line-clamp-2">{n.body}</div>}
                    </div>
                  </div>
                )
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <a href={n.href} onClick={() => setOpen(false)}>
                        {inner}
                      </a>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

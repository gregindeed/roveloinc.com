'use client'

import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import {
  inviteCollaborator,
  revokeEntityAccess,
  grantExistingCollaborator,
  resendCollaboratorInvite,
  searchAddableUsers,
} from '@/app/admin/clients/[slug]/access-actions'

type Collaborator = { id: string; email: string; name: string; handle: string | null; avatar: string | null; firm: string }
type Suggestion = { id: string; name: string; handle: string | null; avatar: string | null; email: string; firm: string }

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
const meta = (handle: string | null, firm: string, email?: string) =>
  [handle ? `@${handle}` : null, firm || null, email || null].filter(Boolean).join(' · ')

export default function EntityAccessPanel({
  slug,
  entityName,
  collaborators,
}: {
  slug: string
  entityName: string
  collaborators: Collaborator[]
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const h = setTimeout(async () => {
      try {
        setResults(await searchAddableUsers(slug, query))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => clearTimeout(h)
  }, [q, slug])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (boxRef.current && !boxRef.current.contains(target)) setOpen(false)
      if (!target.closest('.js-collab-menu')) setMenuFor(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function copyHandle(handle: string) {
    try {
      await navigator.clipboard.writeText(`@${handle}`)
      setCopied(handle)
      setTimeout(() => setCopied((c) => (c === handle ? null : c)), 1500)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const showInvite = looksLikeEmail(q)
  const dropdownOpen = open && q.trim().length >= 2 && (results.length > 0 || showInvite || searching)

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Collaborators</h2>
      <p className="text-xs text-gray-500 mb-3">
        External people who can work on <span className="font-medium">{entityName}</span> only. You and any managers
        already have access to every entity.
      </p>

      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        {collaborators.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {collaborators.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={c.name} email={c.email} url={c.avatar} size={36} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-[11px] text-gray-500 truncate">{meta(c.handle, c.firm)}</div>
                  </div>
                </div>

                <div className="relative js-collab-menu shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuFor((m) => (m === c.id ? null : c.id))}
                    className="flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                    aria-label="Manage collaborator"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>

                  {menuFor === c.id && (
                    <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-100">
                        <div className="text-xs font-medium text-gray-900 truncate">{c.name}</div>
                        <div className="text-[11px] text-gray-500 truncate">{c.email}</div>
                      </div>
                      {c.handle && (
                        <button
                          type="button"
                          onClick={() => copyHandle(c.handle as string)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {copied === c.handle ? 'Copied ✓' : `Copy @${c.handle}`}
                        </button>
                      )}
                      <form action={resendCollaboratorInvite.bind(null, slug, c.id)}>
                        <button type="submit" className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          Resend invite
                        </button>
                      </form>
                      <form action={revokeEntityAccess.bind(null, slug, c.id)}>
                        <button type="submit" className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                          Remove access
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No collaborators on this entity yet.</p>
        )}

        <div className="pt-3 border-t border-gray-100" ref={boxRef}>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Add a collaborator</label>
          <div className="relative">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name or @handle, or type an email"
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            />

            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                {searching && results.length === 0 && !showInvite && (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Searching…</div>
                )}

                {results.map((r) => (
                  <form key={r.id} action={grantExistingCollaborator.bind(null, slug, r.id)}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                    >
                      <Avatar name={r.name} email={r.email} url={r.avatar} size={30} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{r.name}</span>
                        <span className="block text-[11px] text-gray-500 truncate">{meta(r.handle, r.firm, r.email)}</span>
                      </span>
                    </button>
                  </form>
                ))}

                {showInvite && (
                  <form action={inviteCollaborator.bind(null, slug)} className="border-t border-gray-100 first:border-0">
                    <input type="hidden" name="email" value={q.trim()} />
                    <button type="submit" className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="text-sm font-medium text-gray-900">Invite {q.trim()}</div>
                      <div className="text-[11px] text-gray-500">
                        Sends an email invite — or grants access if they already have an account
                      </div>
                    </button>
                  </form>
                )}

                {!searching && results.length === 0 && !showInvite && (
                  <div className="px-3 py-2.5 text-xs text-gray-400">
                    No matches. Type a full email to invite someone new.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

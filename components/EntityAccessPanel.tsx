'use client'

import { useEffect, useRef, useState } from 'react'
import {
  inviteCollaborator,
  revokeEntityAccess,
  grantExistingCollaborator,
  searchAddableUsers,
} from '@/app/admin/clients/[slug]/access-actions'

type Collaborator = { id: string; email: string }
type Suggestion = { id: string; name: string; email: string; firm: string }

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

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
  const boxRef = useRef<HTMLDivElement>(null)

  // Search as you type (debounced). The action returns display-only rows.
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
        const r = await searchAddableUsers(slug, query)
        setResults(r)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => clearTimeout(h)
  }, [q, slug])

  // Close the dropdown when clicking away.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

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
              <li key={c.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <span className="text-sm text-gray-800">{c.email}</span>
                <form action={revokeEntityAccess.bind(null, slug, c.id)}>
                  <button className="text-xs font-medium text-red-600 hover:text-red-700">Remove</button>
                </form>
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
              placeholder="Search by name, or type an email"
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
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                    >
                      <div className="text-sm font-medium text-gray-900">{r.name}</div>
                      <div className="text-[11px] text-gray-500">{[r.firm, r.email].filter(Boolean).join(' · ')}</div>
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

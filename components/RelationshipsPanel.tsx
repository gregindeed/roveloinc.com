'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { searchLinkableClients, linkRelationship, unlinkRelationship } from '@/app/admin/clients/[slug]/relationship-actions'

type Rel = { id: string; role: string; pct: number | null; name: string; slug: string; kind: string }
type Hit = { id: string; name: string; kind: string }

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'officer', label: 'Officer' },
  { value: 'member', label: 'Member' },
  { value: 'manager', label: 'Manager' },
  { value: 'signer', label: 'Signer' },
  { value: 'related', label: 'Related' },
]

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]))

export default function RelationshipsPanel({
  slug,
  clientKind,
  relationships,
}: {
  slug: string
  clientKind: string
  relationships: Rel[]
}) {
  const isIndividual = clientKind === 'individual'
  // From a person we relate businesses; from a business we relate people.
  const heading = isIndividual ? 'Related businesses' : 'People & owners'
  const blurb = isIndividual
    ? 'Businesses this person owns, manages, or signs for. Linking here connects their personal return to the entity books.'
    : 'People connected to this entity — owners, officers, signers. Linking here ties an individual’s return to this business.'
  const addLabel = isIndividual ? 'Link a business' : 'Link a person'
  const searchPlaceholder = isIndividual ? 'Search businesses by name…' : 'Search people by name…'

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [sel, setSel] = useState<Hit | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Type-ahead against RLS-scoped opposite-kind clients.
  useEffect(() => {
    if (sel) return
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let alive = true
    setLoading(true)
    const h = setTimeout(async () => {
      const res = await searchLinkableClients(slug, term)
      if (!alive) return
      setHits(res)
      setOpen(true)
      setLoading(false)
    }, 200)
    return () => {
      alive = false
      clearTimeout(h)
    }
  }, [q, sel, slug])

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(h: Hit) {
    setSel(h)
    setQ(h.name)
    setOpen(false)
  }

  function reset() {
    setSel(null)
    setQ('')
    setHits([])
  }

  return (
    <div className="border border-gray-200 rounded-xl p-5 max-w-2xl">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">{heading}</h2>
      <p className="text-xs text-gray-500 mb-4">{blurb}</p>

      {relationships.length > 0 ? (
        <div className="divide-y divide-gray-100 mb-4">
          {relationships.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="min-w-0">
                <Link
                  href={`/admin/clients/${r.slug}`}
                  className="font-medium text-gray-900 hover:text-gray-500 truncate"
                >
                  {r.name}
                </Link>
                <span className="text-gray-500"> · {ROLE_LABEL[r.role] ?? r.role}</span>
                {r.pct != null && <span className="text-gray-500"> · {r.pct}%</span>}
              </div>
              <form action={unlinkRelationship.bind(null, slug, r.id)}>
                <button className="text-xs text-red-600 hover:text-red-700 whitespace-nowrap">Remove</button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-4">No links yet.</p>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-medium text-gray-700 mb-2">{addLabel}</p>
        <form
          action={sel ? linkRelationship.bind(null, slug, sel.id) : undefined}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="relative" ref={boxRef}>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                if (sel) setSel(null)
              }}
              onFocus={() => hits.length && setOpen(true)}
              placeholder={searchPlaceholder}
              className="w-64 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoComplete="off"
            />
            {open && (hits.length > 0 || loading) && (
              <div className="absolute z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                {loading && hits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
                ) : (
                  hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => pick(h)}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                    >
                      {h.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <select
            name="role"
            defaultValue="owner"
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <input
            name="ownership_pct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="%"
            className="w-20 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />

          <button
            disabled={!sel}
            className="rounded-md bg-gray-900 text-white text-sm font-medium px-3.5 py-1.5 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Link
          </button>
          {sel && (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

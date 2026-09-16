'use client'

import { useMemo, useState } from 'react'
import { DOC_KIND_LABELS, fmtDate, type DocKind } from '@/lib/property'

export type ShelfDoc = {
  id: string
  name: string
  url: string | null
  doc_kind: DocKind
  ai_summary: string | null
  ai_status: 'pending' | 'parsed' | 'failed' | null
  created_at: string
}

// Colored type tag per kind (statements blue, receipts green, invoices amber,
// leases/contracts purple, notices orange, photos gray) — mirrors the Rio Rancho
// documents shelf.
const TAG_STYLE: Partial<Record<DocKind, string>> = {
  statement: 'bg-blue-50 text-blue-700 border-blue-100',
  receipt: 'bg-green-50 text-green-700 border-green-100',
  invoice: 'bg-amber-50 text-amber-700 border-amber-100',
  lease_agreement: 'bg-purple-50 text-purple-700 border-purple-100',
  notice: 'bg-orange-50 text-orange-700 border-orange-100',
  photo: 'bg-gray-100 text-gray-600 border-gray-200',
}
const tagCls = (k: DocKind) => TAG_STYLE[k] ?? 'bg-gray-50 text-gray-600 border-gray-200'

function statusSuffix(s: ShelfDoc['ai_status']): string {
  return s === 'pending' ? ' · reading…' : s === 'failed' ? ' · read failed' : s === 'parsed' ? ' · read by Overseer' : ''
}

export default function DocumentsShelf({
  documents,
  canManage,
  propertyId,
  parseAction,
  deleteAction,
  children,
}: {
  documents: ShelfDoc[]
  canManage: boolean
  propertyId: string
  parseAction: (propertyId: string, docId: string) => Promise<void>
  deleteAction: (propertyId: string, docId: string) => Promise<void>
  children?: React.ReactNode
}) {
  const [cat, setCat] = useState<'all' | DocKind>('all')
  const [q, setQ] = useState('')

  // Which kinds are actually present, with counts — chips are data-driven so the
  // shelf stays clean and grows as new kinds appear.
  const kinds = useMemo(() => {
    const seen = new Map<DocKind, number>()
    for (const d of documents) seen.set(d.doc_kind, (seen.get(d.doc_kind) ?? 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [documents])

  const filtered = documents.filter((d) => {
    if (cat !== 'all' && d.doc_kind !== cat) return false
    const needle = q.trim().toLowerCase()
    if (needle) {
      const hay = `${d.name} ${DOC_KIND_LABELS[d.doc_kind] ?? d.doc_kind} ${d.ai_summary ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
    }`

  return (
    <div className="mt-8">
      <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Documents</h2>
      {children}

      {documents.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No documents yet.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCat('all')} className={chip(cat === 'all')}>
              All <span className="opacity-60">{documents.length}</span>
            </button>
            {kinds.map(([k, n]) => (
              <button key={k} type="button" onClick={() => setCat(k)} className={chip(cat === k)}>
                {DOC_KIND_LABELS[k] ?? k} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents…"
            className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
          />

          <div className="mt-3 space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500">No documents match.</p>
            ) : (
              filtered.map((d) => (
                <div key={d.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-gray-900 hover:text-gray-500">
                            {d.name}
                          </a>
                        ) : (
                          <span className="truncate text-sm font-medium text-gray-900">{d.name}</span>
                        )}
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tagCls(d.doc_kind)}`}>
                          {DOC_KIND_LABELS[d.doc_kind] ?? d.doc_kind}
                        </span>
                      </div>
                      {d.ai_summary && <p className="mt-0.5 text-xs text-gray-500">{d.ai_summary}</p>}
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {fmtDate(d.created_at)}
                        {statusSuffix(d.ai_status)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-gray-600 hover:text-gray-900">
                          Download
                        </a>
                      )}
                      {canManage && (
                        <>
                          <form action={parseAction.bind(null, propertyId, d.id)}>
                            <button type="submit" className="text-[11px] font-medium text-gray-600 hover:text-gray-900">Overseer read</button>
                          </form>
                          <form action={deleteAction.bind(null, propertyId, d.id)}>
                            <button type="submit" className="text-[11px] text-gray-400 hover:text-red-600">Delete</button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

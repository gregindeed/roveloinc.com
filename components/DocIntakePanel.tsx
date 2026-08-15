'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseUploadedDoc, applyExtractedFields } from '@/app/admin/clients/[slug]/intake-actions'
import {
  DOCUMENT_TYPE_LABELS,
  AGENCY_LABELS,
  ENTITY_FIELD_LABELS,
  type DocumentRow,
} from '@/lib/types'
import { sha256Hex } from '@/lib/docHash'

const BUCKET = 'client-docs'

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown; details?: unknown }).message
    const d = (e as { details?: unknown }).details
    return [m, d].filter(Boolean).map(String).join(' — ')
  }
  if (e instanceof Error) return e.message
  return 'Something went wrong.'
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y?.slice(2) ?? ''}`
}

export default function DocIntakePanel({
  slug,
  clientId,
  currentUserId,
  isAdmin,
  folder,
  initialDocs,
  current,
  readOnly = false,
}: {
  slug: string
  clientId: string
  currentUserId: string
  isAdmin: boolean
  folder: string
  initialDocs: DocumentRow[]
  current: Record<string, string | null>
  readOnly?: boolean
}) {
  const supabase = createClient()
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    const { data, error: qErr } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (qErr) {
      setError(`Load failed: ${errMsg(qErr)}`)
      return
    }
    const rows = (data ?? []) as DocumentRow[]
    setDocs(rows)
    // signed URLs for image previews
    const imgs = rows.filter((d) => (d.content_type ?? '').startsWith('image/'))
    if (imgs.length) {
      const next: Record<string, string> = {}
      await Promise.all(
        imgs.map(async (d) => {
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 3600)
          if (s?.signedUrl) next[d.id] = s.signedUrl
        })
      )
      setUrls((prev) => ({ ...prev, ...next }))
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ingest(file: File): Promise<'added' | 'duplicate'> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${clientId}/${Date.now()}-${safeName}`

    // Reject an exact duplicate before uploading anything.
    const contentHash = await sha256Hex(file)
    const { data: dupe } = await supabase
      .from('documents')
      .select('id')
      .eq('client_id', clientId)
      .eq('content_hash', contentHash)
      .limit(1)
      .maybeSingle()
    if (dupe) return 'duplicate'

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (upErr) throw upErr

    const { data: inserted, error: insErr } = await supabase
      .from('documents')
      .insert({
        client_id: clientId,
        name: file.name,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
        content_hash: contentHash,
        uploaded_by: currentUserId,
        uploaded_by_role: isAdmin ? 'admin' : 'client',
        doc_type: 'other',
        folder,
        ai_status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) {
      await supabase.storage.from(BUCKET).remove([path])
      if ((insErr as { code?: string }).code === '23505') return 'duplicate'
      throw insErr
    }
    const docId = inserted!.id as string
    setWorking((w) => new Set(w).add(docId))
    await refresh()
    try {
      await parseUploadedDoc(slug, docId)
    } finally {
      setWorking((w) => {
        const n = new Set(w)
        n.delete(docId)
        return n
      })
      await refresh()
    }
    return 'added'
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    setBusy(true)
    let dupes = 0
    try {
      for (const f of Array.from(files)) {
        if ((await ingest(f)) === 'duplicate') dupes++
      }
    } catch (e) {
      setError(`Upload failed: ${errMsg(e)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    if (dupes > 0) {
      setError(`Skipped ${dupes} duplicate file${dupes === 1 ? '' : 's'} already saved for this client.`)
    }
  }

  async function openDoc(doc: DocumentRow) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(doc: DocumentRow) {
    setBusy(true)
    try {
      await supabase.storage.from(BUCKET).remove([doc.storage_path])
      await supabase.from('documents').delete().eq('id', doc.id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function retry(doc: DocumentRow) {
    setWorking((w) => new Set(w).add(doc.id))
    try {
      await parseUploadedDoc(slug, doc.id)
    } finally {
      setWorking((w) => {
        const n = new Set(w)
        n.delete(doc.id)
        return n
      })
      await refresh()
    }
  }

  async function apply(doc: DocumentRow) {
    setWorking((w) => new Set(w).add(doc.id))
    try {
      await applyExtractedFields(slug, doc.id)
    } finally {
      setWorking((w) => {
        const n = new Set(w)
        n.delete(doc.id)
        return n
      })
      await refresh()
    }
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
          }}
          className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            drag ? 'border-violet-400 bg-violet-50' : 'border-gray-300 bg-gray-50/60'
          }`}
        >
          <p className="text-sm text-gray-700">{busy ? 'Uploading & reading…' : 'Drag & drop documents here'}</p>
          <p className="text-xs text-gray-400 mt-1">
            PDFs and images. The Overseer reads each file, labels it, and pulls out entity data for you to review.
          </p>
          <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
            Choose files
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              disabled={busy}
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {docs.length === 0 ? (
        readOnly ? null : (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
            No documents yet. Drop one above to let the Overseer read it.
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {docs.map((doc) => {
            const isWorking = working.has(doc.id)
            const parsing = isWorking || doc.ai_status === 'pending'
            const fields = doc.ai_fields ?? {}
            const fieldKeys = Object.keys(fields)
            return (
              <div key={doc.id} className="rounded-xl border border-gray-200 bg-white p-3 flex gap-3">
                {/* thumb */}
                <div className="shrink-0">
                  {urls[doc.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urls[doc.id]}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-7 w-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.ai_title || doc.name}
                    </p>
                    {parsing && (
                      <span className="shrink-0 text-[11px] text-violet-600 font-medium">Reading…</span>
                    )}
                  </div>

                  {/* badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {doc.doc_type && doc.doc_type !== 'other' && (
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                        {DOCUMENT_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                      </span>
                    )}
                    {doc.agency && (
                      <span className="text-[10px] font-medium bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                        {AGENCY_LABELS[doc.agency] ?? doc.agency}
                      </span>
                    )}
                    {doc.expires_date && (
                      <span className="text-[10px] font-medium bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
                        exp {fmtDate(doc.expires_date)}
                      </span>
                    )}
                  </div>

                  {doc.ai_summary && !parsing && (
                    <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{doc.ai_summary}</p>
                  )}

                  {doc.ai_status === 'failed' && !isWorking && (
                    <button
                      onClick={() => retry(doc)}
                      className="mt-1.5 text-xs font-medium text-violet-700 hover:text-violet-900"
                    >
                      Retry read
                    </button>
                  )}

                  {/* tags */}
                  {(doc.ai_tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {doc.ai_tags!.slice(0, 6).map((t, i) => (
                        <span key={i} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* proposed entity fields */}
                  {fieldKeys.length > 0 && !parsing && (
                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
                      {doc.ai_applied ? (
                        <p className="text-[11px] font-medium text-green-700">Applied to Account details ✓</p>
                      ) : (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">
                            Found for the entity
                          </p>
                          <ul className="space-y-0.5 mb-2">
                            {fieldKeys.map((k) => (
                              <li key={k} className="text-[11px] text-gray-700 flex gap-1.5">
                                <span className="text-gray-500">{ENTITY_FIELD_LABELS[k] ?? k}:</span>
                                <span className="font-medium">{fields[k]}</span>
                                {current[k] && current[k] !== fields[k] && (
                                  <span className="text-amber-600">(was {current[k]})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          <button
                            onClick={() => apply(doc)}
                            disabled={isWorking}
                            className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-2.5 py-1 disabled:opacity-50"
                          >
                            {isWorking ? 'Applying…' : 'Apply to Account details'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* actions */}
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => openDoc(doc)} className="text-xs font-medium text-gray-700 hover:text-gray-900">
                      Open
                    </button>
                    <button
                      onClick={() => remove(doc)}
                      disabled={busy}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

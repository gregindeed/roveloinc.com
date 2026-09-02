'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseUploadedDoc, moveDocument, applyExtractedFields } from '@/app/admin/clients/[slug]/intake-actions'
import { DOC_CATEGORIES, MONTHS, categoryLabel, monthLabel } from '@/lib/folders'
import { ENTITY_FIELD_LABELS, type DocumentRow } from '@/lib/types'

const BUCKET = 'client-docs'

const MOVE_OPTIONS = [
  ...DOC_CATEGORIES.map((c) => ({ value: c.slug, label: c.label })),
  { value: 'permanent', label: 'Formation & Legal (permanent)' },
  { value: 'agency_notices', label: 'Agency Notices' },
]

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message)
  if (e instanceof Error) return e.message
  return 'Something went wrong.'
}

type Item = { id: string; name: string; status: 'reading' | 'ready' | 'error'; row?: DocumentRow; working?: boolean }

export default function GlobalIntake({
  slug,
  year,
  clientId,
  currentUserId,
  current,
}: {
  slug: string
  year: number
  clientId: string
  currentUserId: string
  current: Record<string, string | null>
}) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [moveId, setMoveId] = useState<string | null>(null)
  const [applyingAll, setApplyingAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const base = `/admin/clients/${slug}/${year}/documents`

  function destOf(row: DocumentRow): { text: string; href: string } {
    const f = row.folder
    if (f === 'permanent') return { text: 'Account details · Formation & Legal', href: `/admin/clients/${slug}/account` }
    if (f === 'agency_notices') return { text: 'Compliance · Notices', href: `/admin/clients/${slug}/${year}/compliance` }
    const y = row.period_year
    if (y == null) return { text: 'Documents & Sources · Unfiled', href: `${base}?year=unfiled` }
    const catSlug = DOC_CATEGORIES.some((c) => c.slug === f) ? (f as string) : 'other'
    const m = row.period_month ?? null
    const mLabel = m ? monthLabel(m) : 'Unsorted'
    return { text: `${y} · ${categoryLabel(catSlug)} · ${mLabel}`, href: `${base}?year=${y}&folder=${catSlug}&month=${m ?? 'none'}` }
  }

  async function fetchRow(id: string): Promise<DocumentRow | undefined> {
    const { data } = await supabase.from('documents').select('*').eq('id', id).single()
    return (data as DocumentRow) ?? undefined
  }

  const patch = (id: string, p: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))

  async function ingest(file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${clientId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (upErr) throw upErr

    const { data: ins, error: insErr } = await supabase
      .from('documents')
      .insert({
        client_id: clientId,
        name: file.name,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: currentUserId,
        uploaded_by_role: 'admin',
        doc_type: 'other',
        folder: 'intake',
        ai_status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) {
      await supabase.storage.from(BUCKET).remove([path])
      throw insErr
    }
    const id = ins!.id as string
    setItems((prev) => [{ id, name: file.name, status: 'reading' }, ...prev])
    await parseUploadedDoc(slug, id, true)
    const row = await fetchRow(id)
    patch(id, { status: row?.ai_status === 'failed' ? 'error' : 'ready', row })
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    setBusy(true)
    try {
      for (const f of Array.from(files)) await ingest(f)
    } catch (e) {
      setError(`Upload failed: ${errMsg(e)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function doMove(id: string, folder: string, year: number | null, month: number | null) {
    patch(id, { working: true })
    await moveDocument(slug, id, folder, year, month)
    const row = await fetchRow(id)
    patch(id, { working: false, row })
    setMoveId(null)
  }

  async function doApply(id: string) {
    patch(id, { working: true })
    await applyExtractedFields(slug, id)
    const row = await fetchRow(id)
    patch(id, { working: false, row })
  }

  async function applyAll() {
    const pend = items.filter(
      (it) => it.row && !it.row.ai_applied && Object.keys(it.row.ai_fields ?? {}).length > 0
    )
    if (!pend.length) return
    setApplyingAll(true)
    for (const it of pend) await applyExtractedFields(slug, it.id)
    const updated = await Promise.all(pend.map(async (it) => ({ id: it.id, row: await fetchRow(it.id) })))
    setItems((prev) =>
      prev.map((p) => {
        const u = updated.find((x) => x.id === p.id)
        return u ? { ...p, row: u.row } : p
      })
    )
    setApplyingAll(false)
  }

  async function openDoc(row: DocumentRow) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function close() {
    setOpen(false)
    setMoveId(null)
    setItems([])
    setError(null)
    router.refresh()
  }

  const pendingApply = items.filter(
    (it) => it.row && !it.row.ai_applied && Object.keys(it.row.ai_fields ?? {}).length > 0
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add files
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={close}>
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Add documents</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-700 text-sm">
                Done
              </button>
            </div>

            {/* Dropzone */}
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
              className={`rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors ${
                drag ? 'border-violet-400 bg-violet-50' : 'border-gray-300 bg-gray-50/60'
              }`}
            >
              <p className="text-sm text-gray-700">{busy ? 'Uploading & reading…' : 'Drag & drop documents here'}</p>
              <p className="text-xs text-gray-400 mt-1">
                PDFs and images. The Overseer reads each file and files it where it belongs.
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

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {/* Apply-all bar */}
            {pendingApply.length > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                <span className="text-xs text-violet-800">
                  {pendingApply.length} document{pendingApply.length === 1 ? '' : 's'} with entity data to review
                </span>
                <button
                  onClick={applyAll}
                  disabled={applyingAll}
                  className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {applyingAll ? 'Applying…' : 'Apply all'}
                </button>
              </div>
            )}

            {/* Filing results */}
            {items.length > 0 && (
              <div className="mt-4 space-y-2">
                {items.map((it) => {
                  const row = it.row
                  const dest = row ? destOf(row) : null
                  const fields = row?.ai_fields ?? {}
                  const fieldKeys = Object.keys(fields)
                  return (
                    <div key={it.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{row?.ai_title || it.name}</p>
                        {it.status === 'reading' && <span className="text-[11px] text-violet-600 font-medium shrink-0">Reading…</span>}
                      </div>

                      {it.status === 'error' && (
                        <p className="text-xs text-red-600 mt-1">
                          Couldn&apos;t read this one — it&apos;s in Unfiled. {row?.ai_summary}
                        </p>
                      )}

                      {dest && it.status !== 'reading' && (
                        <p className="text-xs text-gray-600 mt-1">
                          Filed → <a href={dest.href} className="font-medium text-gray-800 underline">{dest.text}</a>
                        </p>
                      )}

                      {/* move control */}
                      {row && it.status !== 'reading' && (
                        <div className="mt-1.5">
                          {moveId === it.id ? (
                            <MoveForm
                              row={row}
                              working={!!it.working}
                              onCancel={() => setMoveId(null)}
                              onSave={(folder, year, month) => doMove(it.id, folder, year, month)}
                            />
                          ) : (
                            <button
                              onClick={() => setMoveId(it.id)}
                              className="text-[11px] font-medium text-gray-500 hover:text-gray-900"
                            >
                              Move…
                            </button>
                          )}
                        </div>
                      )}

                      {/* proposed entity fields (review-first) */}
                      {fieldKeys.length > 0 && it.status !== 'reading' && (
                        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
                          {row?.ai_applied ? (
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
                                onClick={() => doApply(it.id)}
                                disabled={it.working}
                                className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-2.5 py-1 disabled:opacity-50"
                              >
                                {it.working ? 'Applying…' : 'Apply to Account details'}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {row && it.status !== 'reading' && (
                        <button onClick={() => openDoc(row)} className="mt-2 text-xs font-medium text-gray-700 hover:text-gray-900">
                          Open
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function MoveForm({
  row,
  working,
  onCancel,
  onSave,
}: {
  row: DocumentRow
  working: boolean
  onCancel: () => void
  onSave: (folder: string, year: number | null, month: number | null) => void
}) {
  const [folder, setFolder] = useState<string>(
    DOC_CATEGORIES.some((c) => c.slug === row.folder) || row.folder === 'permanent' || row.folder === 'agency_notices'
      ? (row.folder as string)
      : 'other'
  )
  const [year, setYear] = useState<string>(row.period_year ? String(row.period_year) : String(new Date().getFullYear()))
  const [month, setMonth] = useState<string>(row.period_month ? String(row.period_month) : '')

  const isSource = folder !== 'permanent' && folder !== 'agency_notices'
  const cls = 'border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white'

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <select value={folder} onChange={(e) => setFolder(e.target.value)} className={cls}>
        {MOVE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isSource && (
        <>
          <input value={year} onChange={(e) => setYear(e.target.value)} type="number" className={`${cls} w-16`} placeholder="Year" />
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={cls}>
            <option value="">Unsorted</option>
            {MONTHS.map((m) => (
              <option key={m.n} value={m.n}>
                {m.label}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        onClick={() => onSave(folder, isSource && year ? Number(year) : null, isSource && month ? Number(month) : null)}
        disabled={working}
        className="text-xs font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
      >
        {working ? 'Moving…' : 'Move'}
      </button>
      <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-700 px-1">
        Cancel
      </button>
    </div>
  )
}

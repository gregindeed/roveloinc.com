'use client'

import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseUploadedDoc } from '@/app/admin/clients/[slug]/intake-actions'
import { sha256Hex } from '@/lib/docHash'
import {
  DOCUMENT_TYPE_LABELS,
  AGENCY_LABELS,
  type DocumentRow,
  type DocumentType,
  type GovAgency,
} from '@/lib/types'
import { monthLabel } from '@/lib/folders'

const BUCKET = 'client-docs'

function fmtSize(bytes: number | null) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

// days until expiry (negative = already expired)
function daysUntil(iso: string | null) {
  if (!iso) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(`${iso}T00:00:00`)
  return Math.round((exp.getTime() - today.getTime()) / 86400000)
}

export default function DocumentsPanel({
  clientId,
  currentUserId,
  isAdmin,
  initialDocs,
  title,
  year = null,
  folder = null,
  month = null,
  nullMonth = false,
  unfiledTop = false,
  allowUpload = true,
  showPeriod = false,
  slug = null,
}: {
  clientId: string
  currentUserId: string
  isAdmin: boolean
  initialDocs: DocumentRow[]
  title?: string
  year?: number | null
  folder?: string | null
  month?: number | null
  nullMonth?: boolean
  unfiledTop?: boolean
  allowUpload?: boolean
  showPeriod?: boolean
  slug?: string | null
}) {
  const supabase = createClient()
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docType, setDocType] = useState<DocumentType>('other')
  const [agency, setAgency] = useState<string>('')
  const [expires, setExpires] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [rereadId, setRereadId] = useState<string | null>(null)

  // Re-run the Overseer's read on one already-uploaded doc — used to backfill the
  // Account column (and refresh other extracted fields) without moving the file.
  function reread(doc: DocumentRow) {
    if (!slug) return
    setRereadId(doc.id)
    setError(null)
    startTransition(async () => {
      try {
        await parseUploadedDoc(slug, doc.id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Re-read failed.')
      } finally {
        setRereadId(null)
      }
    })
  }

  async function refresh() {
    let q = supabase.from('documents').select('*').eq('client_id', clientId)
    if (unfiledTop) {
      // Source docs with no period yet — exclude permanent/agency (they live on other tabs).
      q = q.is('period_year', null).or('folder.is.null,and(folder.neq.permanent,folder.neq.agency_notices)')
      const { data } = await q.order('created_at', { ascending: false })
      setDocs((data ?? []) as DocumentRow[])
      return
    }
    if (year != null) q = q.eq('period_year', year)
    if (folder) q = q.eq('folder', folder)
    if (month != null) q = q.eq('period_month', month)
    else if (nullMonth) q = q.is('period_month', null)
    // Sort by month so a whole-year folder list stays in calendar order, then
    // newest-first within a month.
    const { data } = await q.order('period_month', { ascending: true }).order('created_at', { ascending: false })
    setDocs((data ?? []) as DocumentRow[])
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${clientId}/${Date.now()}-${safeName}`

    try {
      // Reject exact duplicates before uploading anything.
      const contentHash = await sha256Hex(file)
      const { data: dupe } = await supabase
        .from('documents')
        .select('name')
        .eq('client_id', clientId)
        .eq('content_hash', contentHash)
        .limit(1)
        .maybeSingle()
      if (dupe) {
        setError(`"${file.name}" is already saved for this client — skipped the duplicate.`)
        return
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (upErr) throw upErr

      const { error: insErr } = await supabase.from('documents').insert({
        client_id: clientId,
        name: file.name,
        storage_path: path,
        content_type: file.type || null,
        size_bytes: file.size,
        content_hash: contentHash,
        uploaded_by: currentUserId,
        uploaded_by_role: isAdmin ? 'admin' : 'client',
        doc_type: docType,
        agency: agency || null,
        expires_date: expires || null,
        period_year: year,
        folder: folder,
        period_month: month,
      })
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path])
        throw insErr
      }
      setExpires('')
      await refresh()
    } catch (err) {
      const code = (err as { code?: string })?.code
      setError(
        code === '23505'
          ? `"${file.name}" is already saved for this client — skipped the duplicate.`
          : err instanceof Error
            ? err.message
            : 'Upload failed.'
      )
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(doc: DocumentRow) {
    setError(null)
    const { data, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setError(sErr?.message ?? 'Could not open file.')
  }

  async function remove(doc: DocumentRow) {
    setBusy(true)
    setError(null)
    try {
      await supabase.storage.from(BUCKET).remove([doc.storage_path])
      const { error: dErr } = await supabase.from('documents').delete().eq('id', doc.id)
      if (dErr) throw dErr
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  const canDelete = (doc: DocumentRow) => isAdmin || doc.uploaded_by === currentUserId
  const selectCls =
    'border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        {title ?? 'Documents'} ({docs.length})
      </h2>

      {/* Upload row */}
      <div className={`flex flex-wrap items-end gap-2 mb-4 ${allowUpload ? '' : 'hidden'}`}>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-600">Type</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)} className={selectCls}>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-600">Agency</span>
          <select value={agency} onChange={(e) => setAgency(e.target.value)} className={selectCls}>
            <option value="">—</option>
            {Object.entries(AGENCY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-600">Expires</span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={selectCls} />
        </label>
        <label className="cursor-pointer text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
          {busy ? 'Working…' : 'Upload file'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={busy} />
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">{error}</div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          {allowUpload ? 'No documents in this folder yet. Upload one above.' : 'Nothing here.'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                {(showPeriod
                  ? ['Name', 'Period', 'Account', 'Type', 'Agency', 'Expires', 'Added', '']
                  : ['Name', 'Type', 'Agency', 'Expires', 'Added', '']
                ).map((h, i) => (
                  <th key={i} className="text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const d = daysUntil(doc.expires_date)
                const expiring = d !== null && d <= 30
                return (
                  <tr key={doc.id} className="border-t border-gray-100 align-top">
                    <td className="px-2.5 py-1.5">
                      <div className="max-w-[360px]">
                        <div className="text-gray-900 truncate" title={doc.name}>{doc.name}</div>
                        {doc.ai_summary ? (
                          <div
                            className="text-[11px] text-gray-500 mt-0.5 leading-snug"
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            title={doc.ai_summary}
                          >
                            {doc.ai_summary}
                          </div>
                        ) : doc.ai_status === 'pending' ? (
                          <div className="text-[11px] text-gray-400 mt-0.5 italic">Reading…</div>
                        ) : null}
                      </div>
                    </td>
                    {showPeriod && (
                      <td className={`px-2.5 py-1.5 whitespace-nowrap ${doc.period_month == null ? 'text-gray-400' : 'text-gray-600'}`}>
                        {monthLabel(doc.period_month)}
                        {doc.period_year ? ` ${doc.period_year}` : ''}
                      </td>
                    )}
                    {showPeriod && (
                      <td className={`px-2.5 py-1.5 tabular-nums whitespace-nowrap ${doc.account_ref ? 'text-gray-700' : 'text-gray-400'}`}>
                        {doc.account_ref ? `••${doc.account_ref}` : '—'}
                      </td>
                    )}
                    <td className="px-2.5 py-1.5 text-gray-600">{DOCUMENT_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</td>
                    <td className="px-2.5 py-1.5 text-gray-600">{doc.agency ? AGENCY_LABELS[doc.agency] : '—'}</td>
                    <td className={`px-2.5 py-1.5 ${expiring ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                      {doc.expires_date ? fmtDate(doc.expires_date) : '—'}
                      {d !== null && d < 0 && ' (expired)'}
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-500">{fmtDate(doc.created_at.slice(0, 10))}</td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {showPeriod && slug && (
                        <button
                          onClick={() => reread(doc)}
                          disabled={pending && rereadId === doc.id}
                          className="mr-3 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
                        >
                          {pending && rereadId === doc.id ? 'Reading…' : 'Re-read'}
                        </button>
                      )}
                      <button onClick={() => download(doc)} className="text-xs font-medium text-gray-700 hover:text-gray-900">Download</button>
                      {canDelete(doc) && (
                        <button onClick={() => remove(doc)} disabled={busy} className="ml-3 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Delete</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

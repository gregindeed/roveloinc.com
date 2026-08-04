'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DOCUMENT_TYPE_LABELS,
  AGENCY_LABELS,
  type DocumentRow,
  type DocumentType,
  type GovAgency,
} from '@/lib/types'

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
}: {
  clientId: string
  currentUserId: string
  isAdmin: boolean
  initialDocs: DocumentRow[]
}) {
  const supabase = createClient()
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [docType, setDocType] = useState<DocumentType>('other')
  const [agency, setAgency] = useState<string>('')
  const [expires, setExpires] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
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
        uploaded_by: currentUserId,
        uploaded_by_role: isAdmin ? 'admin' : 'client',
        doc_type: docType,
        agency: agency || null,
        expires_date: expires || null,
      })
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path])
        throw insErr
      }
      setExpires('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
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
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Documents ({docs.length})</h2>

      {/* Upload row */}
      <div className="flex flex-wrap items-end gap-2 mb-4">
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
        <label className="cursor-pointer rounded-lg bg-gray-900 text-white text-sm font-medium px-3.5 py-2 hover:bg-gray-800 transition-colors">
          {busy ? 'Working…' : 'Upload file'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={busy} />
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          No documents yet. Pick a type and upload one.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {['Name', 'Type', 'Agency', 'Expires', 'Added', ''].map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const d = daysUntil(doc.expires_date)
                const expiring = d !== null && d <= 30
                return (
                  <tr key={doc.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-900">{doc.name}</td>
                    <td className="px-3 py-2 text-gray-600">{DOCUMENT_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</td>
                    <td className="px-3 py-2 text-gray-600">{doc.agency ? AGENCY_LABELS[doc.agency] : '—'}</td>
                    <td className={`px-3 py-2 ${expiring ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>
                      {doc.expires_date ? fmtDate(doc.expires_date) : '—'}
                      {d !== null && d < 0 && ' (expired)'}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(doc.created_at.slice(0, 10))}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
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

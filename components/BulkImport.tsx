'use client'

import { useMemo, useState } from 'react'
import { importRows, type ImportTarget, type ImportRow, type ImportResult } from '@/app/admin/clients/[slug]/import/actions'

type FieldDef = { key: string; label: string; req?: boolean }

const FIELDS: Record<ImportTarget, FieldDef[]> = {
  deposits: [
    { key: 'date', label: 'Date', req: true },
    { key: 'description', label: 'Description', req: true },
    { key: 'amount', label: 'Amount', req: true },
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type' },
  ],
  checking: [
    { key: 'date', label: 'Date', req: true },
    { key: 'description', label: 'Description', req: true },
    { key: 'amount', label: 'Amount', req: true },
    { key: 'check_num', label: 'Check #' },
    { key: 'category', label: 'Category' },
  ],
  cc: [
    { key: 'date', label: 'Date', req: true },
    { key: 'description', label: 'Description', req: true },
    { key: 'amount', label: 'Amount', req: true },
    { key: 'account', label: 'Account' },
    { key: 'category', label: 'Category' },
    { key: 'personal', label: 'Personal (yes/no)' },
  ],
}

const TARGET_LABEL: Record<ImportTarget, string> = {
  deposits: 'Deposits',
  checking: 'Checking expenses',
  cc: 'Credit-card transactions',
}

function splitLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t')
  // basic CSV with double-quote support
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normDate(s: string): string | null {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let [, mm, dd, yy] = m
    if (yy.length === 2) yy = '20' + yy
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}

function normAmount(s: string): number | null {
  let t = s.trim().replace(/[$,\s]/g, '')
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (t === '') return null
  const n = Number(t)
  if (Number.isNaN(n)) return null
  return neg ? -n : n
}

function truthy(s: string) {
  return /^(y|yes|true|1|x|personal)$/i.test(s.trim())
}

function guess(header: string): string | null {
  const h = header.toLowerCase()
  if (/date|posted|posting/.test(h)) return 'date'
  if (/desc|payee|memo|name|detail/.test(h)) return 'description'
  if (/amount|amt|debit|credit|total|charge/.test(h)) return 'amount'
  if (/check|chk/.test(h)) return 'check_num'
  if (/account|acct|card/.test(h)) return 'account'
  if (/categor/.test(h)) return 'category'
  if (/personal/.test(h)) return 'personal'
  return null
}

export default function BulkImport({ slug, initialTarget }: { slug: string; initialTarget: ImportTarget }) {
  const [target, setTarget] = useState<ImportTarget>(initialTarget)
  const [raw, setRaw] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const parsed = useMemo(() => {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
    if (lines.length === 0) return null
    const delim = lines[0].includes('\t') ? '\t' : ','
    const all = lines.map((l) => splitLine(l, delim))
    const width = Math.max(...all.map((r) => r.length))
    const headers = hasHeader ? all[0] : all[0].map((_, i) => `Column ${i + 1}`)
    const rows = hasHeader ? all.slice(1) : all
    return { headers, rows, width }
  }, [raw, hasHeader])

  // auto-map on first parse
  useMemo(() => {
    if (!parsed) return
    if (Object.keys(map).length > 0) return
    const next: Record<string, number> = {}
    parsed.headers.forEach((h, i) => {
      const f = guess(h)
      if (f && next[f] === undefined) next[f] = i
    })
    if (Object.keys(next).length) setMap(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed])

  const fields = FIELDS[target]

  function buildRows(): { rows: ImportRow[]; skipped: number } {
    if (!parsed) return { rows: [], skipped: 0 }
    const out: ImportRow[] = []
    let skipped = 0
    for (const r of parsed.rows) {
      const get = (k: string) => {
        const idx = map[k]
        return idx === undefined ? '' : (r[idx] ?? '')
      }
      const date = normDate(get('date'))
      const description = get('description').trim()
      const amount = normAmount(get('amount'))
      if (!date || !description || amount == null) { skipped++; continue }
      out.push({
        date,
        description,
        amount,
        category: get('category').trim() || null,
        type: get('type').trim() || null,
        check_num: get('check_num').trim() || null,
        account: get('account').trim() || null,
        personal: map['personal'] !== undefined ? truthy(get('personal')) : false,
      })
    }
    return { rows: out, skipped }
  }

  const preview = buildRows()

  async function commit() {
    setBusy(true)
    setResult(null)
    const { rows } = buildRows()
    const res = await importRows(slug, target, rows)
    setResult(res)
    if (res.ok) setRaw('')
    setBusy(false)
  }

  const inp =
    'border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white'

  return (
    <div className="space-y-5">
      {/* Target + input */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">Import into:</label>
        <select
          value={target}
          onChange={(e) => { setTarget(e.target.value as ImportTarget); setResult(null) }}
          className={inp}
        >
          {(Object.keys(TARGET_LABEL) as ImportTarget[]).map((t) => (
            <option key={t} value={t}>{TARGET_LABEL[t]}</option>
          ))}
        </select>
        <label className="text-sm text-gray-600 flex items-center gap-1">
          <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMap({}) }} />
          First row is a header
        </label>
        <label className="text-sm text-gray-700 ml-auto cursor-pointer underline">
          Upload CSV
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) { setRaw(await f.text()); setMap({}) }
            }}
          />
        </label>
      </div>

      <textarea
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setMap({}) }}
        rows={6}
        placeholder="Paste rows from a bank or card statement (copy from a spreadsheet or CSV). First row can be the header."
        className={`${inp} w-full font-mono text-xs`}
      />

      {parsed && (
        <>
          {/* Mapping */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Map columns</h3>
            <div className="flex flex-wrap gap-3">
              {fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-gray-600">
                    {f.label}
                    {f.req && <span className="text-red-500"> *</span>}
                  </span>
                  <select
                    value={map[f.key] ?? -1}
                    onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}
                    className={inp}
                  >
                    <option value={-1}>—</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Review — {preview.rows.length} ready
              {preview.skipped > 0 && `, ${preview.skipped} skipped (missing date/description/amount)`}
            </h3>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {fields.map((f) => (
                      <th key={f.key} className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {fields.map((f) => (
                        <td key={f.key} className="px-3 py-2 text-gray-700">
                          {f.key === 'personal'
                            ? r.personal ? 'Yes' : '—'
                            : String((r as Record<string, unknown>)[f.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 8 && (
              <p className="text-xs text-gray-500 mt-1">…and {preview.rows.length - 8} more.</p>
            )}
          </div>

          <button
            onClick={commit}
            disabled={busy || preview.rows.length === 0}
            className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Importing…' : `Import ${preview.rows.length} row${preview.rows.length === 1 ? '' : 's'} into ${TARGET_LABEL[target]}`}
          </button>
        </>
      )}

      {result && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-sm ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.ok ? `Imported ${result.count} row${result.count === 1 ? '' : 's'}.` : result.error}
        </div>
      )}
    </div>
  )
}

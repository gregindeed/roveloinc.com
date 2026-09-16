'use client'

import { useMemo, useState } from 'react'
import type { ImportRow } from '@/app/admin/leads/actions'

type Parsed = { headers: string[]; rows: string[][] }

// Target fields we can fill from a spreadsheet, with keywords used to auto-guess
// which column maps to each.
const FIELDS: { key: keyof ImportRow; label: string; required?: boolean; keywords: string[] }[] = [
  { key: 'name', label: 'Name', required: true, keywords: ['name', 'company', 'business', 'client', 'account'] },
  { key: 'kind', label: 'Type (business/individual)', keywords: ['kind', 'type', 'category', 'entity'] },
  { key: 'contact_name', label: 'Contact name', keywords: ['contact', 'owner', 'attention', 'primary'] },
  { key: 'email', label: 'Email', keywords: ['email', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Phone', keywords: ['phone', 'tel', 'mobile', 'cell'] },
  { key: 'tax_id', label: 'EIN / Tax ID', keywords: ['ein', 'tax', 'tin'] },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'location', 'addr'] },
  { key: 'notes', label: 'Notes', keywords: ['note', 'comment', 'memo'] },
  { key: 'source', label: 'Source', keywords: ['source', 'origin', 'referral'] },
]

// A small CSV/TSV parser: honours quoted fields, escaped "" quotes, and picks
// comma vs tab by whichever the header line uses more.
function parseDelimited(text: string): Parsed {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!clean) return { headers: [], rows: [] }
  const firstLine = clean.split('\n')[0]
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ','

  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      record.push(field); field = ''
    } else if (c === '\n') {
      record.push(field); records.push(record); field = ''; record = []
    } else field += c
  }
  record.push(field)
  records.push(record)

  const headers = (records.shift() ?? []).map((h) => h.trim())
  const rows = records.filter((r) => r.some((c) => c.trim() !== ''))
  return { headers, rows }
}

const guess = (headers: string[], keywords: string[]): number => {
  const norm = headers.map((h) => h.toLowerCase())
  for (let i = 0; i < norm.length; i++) if (keywords.some((k) => norm[i].includes(k))) return i
  return -1
}

const selectCls =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900'

export default function ImportWizard({
  onImport,
  canCreateAccounts,
  lockDestination,
}: {
  onImport: (destination: 'leads' | 'accounts', rows: ImportRow[]) => Promise<{ created: number; skipped: number; error?: string }>
  canCreateAccounts: boolean
  // When set, imports always go to this destination and the chooser is hidden
  // (e.g. the leads page only imports leads).
  lockDestination?: 'leads' | 'accounts'
}) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [destination, setDestination] = useState<'leads' | 'accounts'>(lockDestination ?? 'leads')
  const [defaultKind, setDefaultKind] = useState<'business' | 'individual'>('business')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; error?: string } | null>(null)

  function doParse(raw: string) {
    const p = parseDelimited(raw)
    setParsed(p)
    setResult(null)
    if (p.headers.length > 0) {
      const m: Record<string, number> = {}
      for (const f of FIELDS) m[f.key as string] = guess(p.headers, f.keywords)
      setMapping(m)
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const t = String(reader.result ?? '')
      setText(t)
      doParse(t)
    }
    reader.readAsText(file)
  }

  const mappedRows: ImportRow[] = useMemo(() => {
    if (!parsed) return []
    return parsed.rows.map((row) => {
      const out: ImportRow = {}
      for (const f of FIELDS) {
        const idx = mapping[f.key as string]
        if (idx != null && idx >= 0) out[f.key] = (row[idx] ?? '').trim()
      }
      if (!out.kind) out.kind = defaultKind
      return out
    })
  }, [parsed, mapping, defaultKind])

  const validCount = mappedRows.filter((r) => (r.name ?? '').trim() !== '').length
  const nameMapped = (mapping['name'] ?? -1) >= 0

  async function submit() {
    setBusy(true)
    try {
      const res = await onImport(destination, mappedRows)
      setResult(res)
    } catch (e) {
      setResult({ created: 0, skipped: 0, error: e instanceof Error ? e.message : 'Import failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1 — paste or upload */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Paste rows, or upload a CSV</label>
          <label className="cursor-pointer text-sm font-medium text-gray-500 transition-colors hover:text-gray-900">
            Choose file…
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); doParse(e.target.value) }}
          rows={6}
          placeholder={'name,email,phone,type\nAcme LLC,ap@acme.com,555-0100,business\nJane Doe,jane@x.com,555-0142,individual'}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="mt-1 text-[11px] text-gray-400">First row must be column headers. Comma- or tab-separated.</p>
      </div>

      {parsed && parsed.headers.length > 0 && (
        <>
          {/* Step 2 — map columns */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Map columns</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key as string} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-sm text-gray-700">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </span>
                  <select
                    value={mapping[f.key as string] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key as string]: Number(e.target.value) }))}
                    className={selectCls}
                  >
                    <option value={-1}>— none —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!nameMapped && <p className="mt-2 text-[11px] text-red-600">Map a column to <strong>Name</strong> to continue.</p>}
          </div>

          {/* Step 3 — destination + options */}
          <div className="flex flex-wrap items-end gap-4">
            {!lockDestination && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Import as</p>
                <div className="inline-flex rounded-full border border-gray-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDestination('leads')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${destination === 'leads' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Leads
                  </button>
                  <button
                    type="button"
                    onClick={() => canCreateAccounts && setDestination('accounts')}
                    disabled={!canCreateAccounts}
                    title={canCreateAccounts ? '' : 'Only managers can create accounts'}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${destination === 'accounts' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'} ${!canCreateAccounts ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    Accounts
                  </button>
                </div>
              </div>
            )}
            {(mapping['kind'] ?? -1) < 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Default type</p>
                <select value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as 'business' | 'individual')} className={selectCls}>
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Preview <span className="font-normal text-gray-400">· {validCount} of {parsed.rows.length} rows will import</span>
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-400">
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-2 py-1.5 font-medium">Contact</th>
                    <th className="px-2 py-1.5 font-medium">Email</th>
                    <th className="px-2 py-1.5 font-medium">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 8).map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 ${(r.name ?? '').trim() === '' ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-1.5 text-gray-900">{r.name || <span className="text-red-500">— no name —</span>}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.kind}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.contact_name || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.email || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 8 && <p className="mt-1 text-[11px] text-gray-400">…and {parsed.rows.length - 8} more.</p>}
          </div>

          {/* Commit */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !nameMapped || validCount === 0}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Importing…' : `Import ${validCount} ${destination === 'leads' ? 'lead' : 'account'}${validCount === 1 ? '' : 's'}`}
            </button>
            {result && !result.error && (
              <span className="text-sm text-green-700">
                Imported {result.created}{result.skipped > 0 ? ` · skipped ${result.skipped} without a name` : ''}.
              </span>
            )}
            {result?.error && <span className="text-sm text-red-600">{result.error}</span>}
          </div>
        </>
      )}
    </div>
  )
}

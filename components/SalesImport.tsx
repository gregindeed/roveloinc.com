'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Account, SaleTender } from '@/lib/types'
import { TENDER_LABELS } from '@/lib/types'
import { spreadsheetPretext } from '@/lib/xlsxClient'
import { downloadCsv } from '@/lib/csv'
import { bulkAddSalesEntries, type ImportRow } from '@/app/admin/clients/[slug]/sales-actions'

// Bulk import for the sales journal. Staff paste CSV or drop a CSV/Excel file;
// we parse + match to the chart of accounts IN THE BROWSER, show a preview, then
// insert. Deterministic (no AI) so what you see is exactly what posts.

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else if (ch === '"') q = true
    else cur += ch
  }
  out.push(cur)
  return out
}

function parseDate(s: string): string | null {
  const t = (s || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const mo = parseInt(m[1], 10)
    const d = parseInt(m[2], 10)
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
      return `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

const parseNum = (s: string) => {
  const n = Number(String(s ?? '').replace(/[$,\s]/g, ''))
  return Number.isNaN(n) ? NaN : n
}

function normTender(s: string): SaleTender {
  const t = (s || '').toLowerCase()
  if (t.includes('cash')) return 'cash'
  if (t.includes('check') || t.includes('cheque')) return 'check'
  if (t.includes('ach')) return 'ach'
  if (t.includes('financ')) return 'financing'
  if (/card|credit|debit|visa|master|amex|discover|clover|square/.test(t)) return 'card'
  return 'other'
}

const findCol = (headers: string[], res: RegExp) => headers.findIndex((h) => res.test(h))

type Preview = ImportRow & { streamRaw: string; label: string; matched: boolean }

export default function SalesImport({ slug, incomeAccounts }: { slug: string; incomeAccounts: Account[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<Preview[]>([])
  const [meta, setMeta] = useState<{ skipped: number; unmatched: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function matchAccount(stream: string): { id: string | null; label: string; matched: boolean } {
    const s = stream.trim().toLowerCase()
    if (!s) return { id: null, label: 'Uncategorized', matched: false }
    const byCode = incomeAccounts.find((a) => a.code.toLowerCase() === s)
    const byName = incomeAccounts.find((a) => a.name.toLowerCase() === s || a.name.toLowerCase().includes(s) || s.includes(a.name.toLowerCase()))
    const a = byCode || byName
    return a ? { id: a.id, label: `${a.code} · ${a.name}`, matched: true } : { id: null, label: 'Uncategorized', matched: false }
  }

  function parse(text: string) {
    setMsg(null)
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      setRows([])
      setMeta(null)
      setMsg('Need a header row plus at least one data row.')
      return
    }
    const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
    const iDate = findCol(headers, /date/)
    const iAmount = (() => {
      const a = findCol(headers, /amount/)
      if (a >= 0) return a
      const t = findCol(headers, /total|gross/)
      return t
    })()
    const iStream = findCol(headers, /stream|account|revenue|category|item|product|service/)
    const iTender = findCol(headers, /tender|payment|method|pay type|type/)
    const iQty = findCol(headers, /qty|quantity|count|units/)

    if (iDate < 0 || iAmount < 0) {
      setRows([])
      setMeta(null)
      setMsg('Could not find a "date" and an "amount" column in the header.')
      return
    }

    const out: Preview[] = []
    let skipped = 0
    let unmatched = 0
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i])
      const date = parseDate(cells[iDate] ?? '')
      const amount = parseNum(cells[iAmount] ?? '')
      if (!date || Number.isNaN(amount)) {
        skipped++
        continue
      }
      const streamRaw = iStream >= 0 ? (cells[iStream] ?? '') : ''
      const m = matchAccount(streamRaw)
      if (streamRaw.trim() && !m.matched) unmatched++
      const tender = iTender >= 0 ? normTender(cells[iTender] ?? '') : 'other'
      const qtyN = iQty >= 0 ? parseInt(String(cells[iQty] ?? '').replace(/[^\d-]/g, ''), 10) : NaN
      out.push({
        entry_date: date,
        account_id: m.id,
        tender,
        qty: Number.isNaN(qtyN) ? null : qtyN,
        amount,
        streamRaw,
        label: m.label,
        matched: m.matched,
      })
    }
    setRows(out)
    setMeta({ skipped, unmatched })
    if (!out.length) setMsg('No valid rows found. Check the date and amount columns.')
  }

  async function onFile(file: File) {
    const pretext = await spreadsheetPretext(file)
    const text = pretext ?? (await file.text())
    setRaw(text.slice(0, 200000))
    parse(text)
  }

  async function doImport() {
    if (!rows.length) return
    setBusy(true)
    setMsg(null)
    const payload: ImportRow[] = rows.map(({ entry_date, account_id, tender, qty, amount }) => ({
      entry_date,
      account_id,
      tender,
      qty,
      amount,
    }))
    const res = await bulkAddSalesEntries(slug, payload)
    setBusy(false)
    if (res.ok) {
      setMsg(`Imported ${res.inserted} rows.`)
      setRows([])
      setRaw('')
      setMeta(null)
      router.refresh()
    } else {
      setMsg(res.error || 'Import failed.')
    }
  }

  function template() {
    downloadCsv('sales_import_template', [
      ['date', 'stream', 'tender', 'qty', 'amount'],
      ['2026-07-01', 'New Tire Sales', 'card', '4', '620.00'],
      ['2026-07-01', 'Service & Labor', 'cash', '', '145.00'],
    ])
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <h2 className="text-sm font-semibold text-gray-900">Import sales (CSV / Excel)</h2>
        <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Paste rows or drop a CSV/Excel file. Needs a header with <strong>date</strong> and <strong>amount</strong>;
            optional <strong>stream</strong>, <strong>tender</strong>, <strong>qty</strong>. Streams match your income
            accounts by code or name.{' '}
            <button onClick={template} className="underline font-medium text-gray-700 hover:text-gray-900">
              Download template
            </button>
          </p>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="date,stream,tender,qty,amount&#10;2026-07-01,New Tire Sales,card,4,620.00"
            className="w-full h-28 rounded-lg border border-gray-200 p-2 text-xs font-mono"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => parse(raw)} className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:border-gray-300">
              Preview pasted
            </button>
            <label className="h-8 inline-flex items-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:border-gray-300 cursor-pointer">
              Choose file
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
            {rows.length > 0 && (
              <button
                onClick={doImport}
                disabled={busy}
                className="h-8 rounded-lg bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Import ${rows.length} rows`}
              </button>
            )}
          </div>

          {msg && <p className="text-xs text-gray-600">{msg}</p>}

          {meta && rows.length > 0 && (
            <div className="text-xs text-gray-500">
              {rows.length} rows ready
              {meta.unmatched > 0 && <span className="text-amber-600"> · {meta.unmatched} unmatched stream(s) → Uncategorized</span>}
              {meta.skipped > 0 && <span> · {meta.skipped} skipped (bad date/amount)</span>}
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Date', 'Stream', 'Tender', 'Qty', 'Amount'].map((h) => (
                      <th key={h} className={`px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-gray-500 font-medium ${h === 'Amount' ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-700">{r.entry_date}</td>
                      <td className={`px-2 py-1.5 ${r.matched ? 'text-gray-700' : 'text-amber-600'}`}>{r.label}</td>
                      <td className="px-2 py-1.5 text-gray-700">{TENDER_LABELS[r.tender as SaleTender]}</td>
                      <td className="px-2 py-1.5 text-gray-700">{r.qty ?? ''}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-900">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <div className="px-2 py-1.5 text-[11px] text-gray-400">…and {rows.length - 50} more</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

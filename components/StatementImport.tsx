'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseStatementFile, commitStatement, importPendingStatement, type ScanResult, type ScanStatementResult } from '@/app/admin/clients/[slug]/statement-actions'
import type { ParsedStatement } from '@/lib/ai'

const BUCKET = 'client-docs'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const periodText = (y: number | null, m: number | null) =>
  y ? (m ? `${MON[m - 1]} ${y}` : `${y}`) : 'Period unknown'

// A small inline spinner. Inherits the current text color.
function Spinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  )
}

type RowState = { state: 'queued' | 'reading' | 'done'; result?: ScanStatementResult }

type Phase = 'idle' | 'reading' | 'preview' | 'committing' | 'done'

// A bank/card statement that's already sitting in Documents & Sources but whose
// transactions were never posted to the ledger. We import it straight from its
// stored path — no re-upload — through the same parse → reconcile → commit flow.
export type PendingStatement = {
  id: string
  name: string
  path: string
  contentType: string
  periodYear: number | null
  periodMonth: number | null
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message)
  if (e instanceof Error) return e.message
  return 'Something went wrong.'
}

export default function StatementImport({
  slug,
  clientId,
  pending = [],
}: {
  slug: string
  clientId: string
  pending?: PendingStatement[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [statement, setStatement] = useState<ParsedStatement | null>(null)
  const [dupes, setDupes] = useState(0)
  const [stype, setStype] = useState<'bank' | 'card'>('bank')
  const [uploaded, setUploaded] = useState<{ path: string; name: string } | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; reconciled: boolean; difference: number; hasBalances: boolean } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [rowStatus, setRowStatus] = useState<Record<string, RowState>>({})

  // One-click: read every uploaded statement and post what it finds — but driven
  // one at a time from the client so each row shows live progress (queued →
  // reading → result) instead of a single opaque "working" state.
  async function scanAll() {
    setScanning(true)
    setScan(null)
    setError(null)
    const queue = [...pending]
    setRowStatus(Object.fromEntries(queue.map((d) => [d.id, { state: 'queued' as const }])))

    const results: ScanStatementResult[] = []
    for (const d of queue) {
      setRowStatus((prev) => ({ ...prev, [d.id]: { state: 'reading' } }))
      try {
        const r = await importPendingStatement(slug, d.path, d.name, d.contentType)
        results.push(r)
        setRowStatus((prev) => ({ ...prev, [d.id]: { state: 'done', result: r } }))
      } catch (e) {
        const r: ScanStatementResult = { name: d.name, posted: 0, reconciled: null, difference: 0, type: 'bank', error: errMsg(e) }
        results.push(r)
        setRowStatus((prev) => ({ ...prev, [d.id]: { state: 'done', result: r } }))
      }
    }

    setScan({ ok: true, processed: queue.length, posted: results.reduce((s, r) => s + r.posted, 0), statements: results })
    setScanning(false)
    router.refresh()
  }

  // Fresh upload: store the file, then parse it from the stored path.
  async function handleFile(file: File) {
    setError(null)
    setReadingId(null)
    setPhase('reading')
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${clientId}/statements/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      })
      if (upErr) throw upErr
      setUploaded({ path, name: file.name })

      const res = await parseStatementFile(slug, path, file.name, file.type || '')
      if (!res.ok) {
        setError(res.error)
        setPhase('idle')
        return
      }
      setStatement(res.statement)
      setDupes(res.possibleDuplicates)
      setStype(res.statement.statement_type === 'card' ? 'card' : 'bank')
      setPhase('preview')
    } catch (e) {
      setError(`Upload failed: ${errMsg(e)}`)
      setPhase('idle')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Already-uploaded statement: parse it in place from its stored path — no
  // re-upload. Same preview/reconcile/commit path as a fresh drop.
  async function importExisting(doc: PendingStatement) {
    setError(null)
    setReadingId(doc.id)
    setPhase('reading')
    try {
      setUploaded({ path: doc.path, name: doc.name })
      const res = await parseStatementFile(slug, doc.path, doc.name, doc.contentType)
      if (!res.ok) {
        setError(res.error)
        setPhase('idle')
        setReadingId(null)
        return
      }
      setStatement(res.statement)
      setDupes(res.possibleDuplicates)
      setStype(res.statement.statement_type === 'card' ? 'card' : 'bank')
      setPhase('preview')
    } catch (e) {
      setError(`Couldn't read that statement: ${errMsg(e)}`)
      setPhase('idle')
      setReadingId(null)
    }
  }

  async function commit() {
    if (!statement || !uploaded) return
    setPhase('committing')
    setError(null)
    try {
      const res = await commitStatement(slug, {
        storagePath: uploaded.path,
        filename: uploaded.name,
        statementType: stype,
        statement,
      })
      if (!res.ok) {
        setError(res.error)
        setPhase('preview')
        return
      }
      setResult(res)
      setPhase('done')
      router.refresh()
    } catch (e) {
      setError(`Import failed: ${errMsg(e)}`)
      setPhase('preview')
    }
  }

  function reset() {
    setStatement(null)
    setUploaded(null)
    setResult(null)
    setError(null)
    setReadingId(null)
    setPhase('idle')
  }

  // ── Preview reconciliation (recomputed live as the type toggles) ───────────
  const recon = (() => {
    if (!statement) return null
    const totalIn = statement.transactions.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0)
    const totalOut = statement.transactions.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0)
    const ob = statement.opening_balance
    const cb = statement.closing_balance
    const hasBalances = ob != null && cb != null
    let difference = 0
    let balanced = false
    if (hasBalances) {
      const expected = stype === 'bank' ? ob! + totalIn - totalOut : ob! + totalOut - totalIn
      difference = Math.round((cb! - expected) * 100) / 100
      balanced = Math.abs(difference) < 0.01
    }
    const inserts = stype === 'bank' ? statement.transactions.length : statement.transactions.filter((t) => t.direction === 'out').length
    return { totalIn, totalOut, ob, cb, hasBalances, difference, balanced, inserts }
  })()

  return (
    <div>
      {phase === 'done' && result ? (
        <div className="rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Statement imported</h2>
          <p className="text-sm text-gray-700">
            {result.inserted} transaction{result.inserted === 1 ? '' : 's'} added and auto-categorized.
          </p>
          {result.hasBalances ? (
            result.reconciled ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                ✓ Reconciled — activity ties to the statement balance.
              </p>
            ) : (
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                ⚠ Off by {money(Math.abs(result.difference))} — a line may be misread or missing. Review the imported rows.
              </p>
            )
          ) : (
            <p className="mt-2 text-sm text-gray-500">No opening/closing balance detected, so this import wasn&apos;t reconciled.</p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={reset} className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
              {pending.length > 0 ? `Import next (${pending.length} left)` : 'Import another'}
            </button>
            <a href={`/admin/clients/${slug}`} className="rounded-lg border border-gray-200 text-sm font-medium px-3.5 py-2 text-gray-700 hover:text-gray-900">
              View P&amp;L
            </a>
          </div>
        </div>
      ) : (phase === 'preview' || phase === 'committing') && statement && recon ? (
        <div className="rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">Review before importing</h2>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700">
              Cancel
            </button>
          </div>

          {uploaded && <p className="-mt-2 text-xs text-gray-400 truncate">{uploaded.name}</p>}

          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-gray-600">
              Statement type
              <select
                value={stype}
                onChange={(e) => setStype(e.target.value as 'bank' | 'card')}
                className="block mt-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="bank">Bank / checking</option>
                <option value="card">Credit card</option>
              </select>
            </label>
            <div className="text-xs text-gray-500">
              <div className="text-gray-400 uppercase tracking-wide text-[10px]">Period</div>
              {statement.period_start ?? '—'} → {statement.period_end ?? '—'}
            </div>
            <div className="text-xs text-gray-500">
              <div className="text-gray-400 uppercase tracking-wide text-[10px]">Opening → Closing</div>
              {recon.ob != null ? money(recon.ob) : '—'} → {recon.cb != null ? money(recon.cb) : '—'}
            </div>
          </div>

          {dupes > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
              ⚠ <strong>{dupes}</strong> of these rows already exist in the books (same date, amount, and description) —
              this statement may have been imported before. Importing again will duplicate them.
            </div>
          )}

          {/* Reconciliation banner */}
          {recon.hasBalances ? (
            recon.balanced ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
                ✓ Balances — opening {money(recon.ob!)} {stype === 'bank' ? '+ deposits − withdrawals' : '+ charges − payments'} = closing {money(recon.cb!)}.
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                ⚠ Off by <strong>{money(Math.abs(recon.difference))}</strong> — the parsed activity doesn&apos;t tie to the closing balance. Check the statement type is right and look for a misread amount. You can still import and fix rows after.
              </div>
            )
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">
              No opening/closing balance detected — importing without a reconciliation check.
            </div>
          )}

          <div className="text-xs text-gray-500">
            {statement.transactions.filter((t) => t.direction === 'in').length} in · {money(recon.totalIn)} &nbsp;·&nbsp;{' '}
            {statement.transactions.filter((t) => t.direction === 'out').length} out · {money(recon.totalOut)}
            {stype === 'card' && (
              <span className="text-gray-400"> &nbsp;· payments not imported (recorded on the bank side)</span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">Date</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">Description</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">Dir</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions.map((t, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{t.date}</td>
                    <td className="px-3 py-1.5 text-gray-800">{t.description}</td>
                    <td className={`px-3 py-1.5 ${t.direction === 'in' ? 'text-green-700' : 'text-gray-500'}`}>
                      {t.direction === 'in' ? 'in' : 'out'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-900">{money(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={commit}
            disabled={phase === 'committing'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
          >
            {phase === 'committing' ? (
              <>
                <Spinner /> Importing &amp; categorizing…
              </>
            ) : (
              `Import ${recon.inserts} transaction${recon.inserts === 1 ? '' : 's'}`
            )}
          </button>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
      ) : (
        <>
          {/* Result of a "Scan & import all" pass */}
          {scan && (
            <div className="rounded-xl border border-gray-200 p-4 mb-4">
              {scan.ok ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {scan.processed === 0
                        ? 'Nothing new to import'
                        : `Posted ${scan.posted} transaction${scan.posted === 1 ? '' : 's'} from ${scan.processed} statement${scan.processed === 1 ? '' : 's'}`}
                    </h2>
                    <button onClick={() => setScan(null)} className="text-xs text-gray-400 hover:text-gray-700">
                      Dismiss
                    </button>
                  </div>
                  {scan.processed === 0 ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Every uploaded statement has already been posted to the ledger.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-gray-100">
                      {scan.statements.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="min-w-0 truncate text-gray-700">{s.name}</span>
                          <span className="shrink-0 text-xs">
                            {s.error ? (
                              <span className="text-red-600">Couldn&apos;t read — {s.error}</span>
                            ) : (
                              <span className="text-gray-500">
                                {s.posted} row{s.posted === 1 ? '' : 's'} ·{' '}
                                {s.reconciled === null ? (
                                  <span className="text-gray-400">no balance</span>
                                ) : s.reconciled ? (
                                  <span className="text-green-700 font-medium">✓ reconciled</span>
                                ) : (
                                  <span className="text-amber-700 font-medium">⚠ off {money(Math.abs(s.difference))}</span>
                                )}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {scan.statements.some((s) => s.error || s.reconciled === false) && (
                    <p className="text-xs text-gray-500 mt-3">
                      Flagged rows are still posted (except reads that failed) — review them in Transactions, or Undo the
                      batch in the import history below.
                    </p>
                  )}
                </>
              ) : (
                <div className="text-sm text-red-700">{scan.error}</div>
              )}
            </div>
          )}

          {/* Already-uploaded statements waiting to be posted to the ledger */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">Uploaded statements ready to post</h2>
                  <span className="text-[11px] font-medium text-white bg-gray-900 rounded-full px-1.5 py-0.5 tabular-nums">
                    {pending.length}
                  </span>
                </div>
                <button
                  onClick={scanAll}
                  disabled={scanning || phase === 'reading'}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-70"
                >
                  {scanning ? (
                    <>
                      <Spinner />
                      Reading {Object.values(rowStatus).filter((r) => r.state === 'done').length}/{pending.length}…
                    </>
                  ) : (
                    `Scan & import all · ${pending.length}`
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                The Overseer reads every statement and posts what it finds in one pass. Or import one at a time below to
                see each reconcile preview first. Every batch stays undoable, and anything that doesn&apos;t reconcile is
                flagged.
              </p>
              <ul className="divide-y divide-gray-100">
                {pending.map((d) => {
                  const st = rowStatus[d.id]
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{d.name}</p>
                        <p className="text-[11px] text-gray-400">{periodText(d.periodYear, d.periodMonth)}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {st?.state === 'reading' ? (
                          <span className="inline-flex items-center gap-1.5 text-violet-700">
                            <Spinner /> Reading…
                          </span>
                        ) : st?.state === 'queued' ? (
                          <span className="text-gray-400">Queued</span>
                        ) : st?.state === 'done' ? (
                          st.result?.error ? (
                            <span className="text-red-600">Couldn&apos;t read</span>
                          ) : (
                            <span className="text-gray-500">
                              {st.result?.posted ?? 0} rows ·{' '}
                              {st.result?.reconciled == null ? (
                                <span className="text-gray-400">no balance</span>
                              ) : st.result.reconciled ? (
                                <span className="text-green-700 font-medium">✓</span>
                              ) : (
                                <span className="text-amber-700 font-medium">⚠</span>
                              )}
                            </span>
                          )
                        ) : (
                          <button
                            onClick={() => importExisting(d)}
                            disabled={phase === 'reading' || scanning}
                            className="inline-flex items-center gap-1.5 font-medium text-gray-900 hover:text-gray-500 transition-colors disabled:opacity-50 disabled:hover:text-gray-900"
                          >
                            {phase === 'reading' && readingId === d.id ? (
                              <>
                                <Spinner /> Reading…
                              </>
                            ) : (
                              'Import →'
                            )}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
            }}
            className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              drag ? 'border-violet-400 bg-violet-50' : 'border-gray-300 bg-gray-50/60'
            }`}
          >
            <p className="text-sm text-gray-700">
              {phase === 'reading' && !readingId ? (
                <span className="inline-flex items-center gap-1.5 text-violet-700">
                  <Spinner /> Reading the statement…
                </span>
              ) : (
                'Drop a bank or credit-card statement'
              )}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, image, or CSV/Excel. The Overseer extracts the transactions and balances, files them, and reconciles.
            </p>
            <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors">
              {phase === 'reading' && !readingId ? 'Reading…' : 'Choose file'}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                disabled={phase === 'reading'}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </>
      )}
    </div>
  )
}

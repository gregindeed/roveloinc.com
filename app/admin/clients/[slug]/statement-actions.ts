'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseStatementDoc, parseStatementText, type ParsedStatement } from '@/lib/ai'
import { autoCategorizeAll } from './ledger-actions'
import { recomputeBySlug } from '@/lib/entityStateServer'
import { scanAndMatch } from '@/lib/signalsServer'

const BUCKET = 'client-docs'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

async function clientIdFor(supabase: Awaited<ReturnType<typeof admin>>, slug: string): Promise<string | null> {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return (data?.id as string) ?? null
}

function imgMime(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

type ParseResult =
  | { ok: true; statement: ParsedStatement; possibleDuplicates: number }
  | { ok: false; error: string }

// Normalize a bank description so OCR jitter doesn't defeat de-duplication:
// drop everything from a confirmation code onward, strip long digit runs
// (reference numbers), remove punctuation, collapse whitespace. Mirrors the
// SQL normalize() used in the one-off cleanup so import-time and cleanup-time
// dedup agree.
function normDesc(desc: string): string {
  return (desc || '')
    .toLowerCase()
    .split('conf')[0]
    .replace(/[0-9]{4,}/g, ' ')
    .replace(/[^a-z0-9/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// De-dup key. Bank deposits/card omit check_num; checking includes it so two
// genuinely different checks (same day/amount) never collapse.
const normKey = (date: string, amount: number, desc: string, checkNum?: string | null) =>
  `${date}|${Math.round((Number(amount) || 0) * 100)}|${checkNum ?? ''}|${normDesc(desc)}`

// Parse an already-uploaded statement file into structured line items + balances.
export async function parseStatementFile(
  slug: string,
  storagePath: string,
  filename: string,
  contentType: string,
  pretext?: string
): Promise<ParseResult> {
  const supabase = await admin()
  const ext = (filename.split('.').pop() || '').toLowerCase()
  const media = contentType || ''
  const isPdf = media === 'application/pdf' || ext === 'pdf'
  const isImg = media.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
  const isExcel = ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'].includes(ext) || /sheet|excel/.test(media)
  const isText = media.startsWith('text/') || ['txt', 'csv', 'tsv'].includes(ext)
  const hasPretext = !!(pretext && pretext.trim())

  try {
    let statement: ParsedStatement
    if (hasPretext) {
      // Spreadsheet text extracted in the browser — no Worker XLSX (1102-safe).
      statement = await parseStatementText(pretext!)
    } else if (isPdf || isImg) {
      const mt = isPdf ? 'application/pdf' : media.startsWith('image/') ? media : imgMime(ext)
      const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300)
      if (error || !signed?.signedUrl) return { ok: false, error: error?.message || 'Could not read the file.' }
      statement = await parseStatementDoc({ mediaType: mt, url: signed.signedUrl })
    } else if (isExcel) {
      // Never parse XLSX in the Worker (128MB / CPU → 1102). It should have been
      // converted in the browser; if we got here, ask for a re-upload / CSV.
      return {
        ok: false,
        error: 'Excel files are read in your browser — re-upload this one, or export it to CSV.',
      }
    } else if (isText) {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath)
      if (error || !blob) return { ok: false, error: error?.message || 'Could not download the file.' }
      statement = await parseStatementText(new TextDecoder().decode(await blob.arrayBuffer()))
    } else {
      return { ok: false, error: `Can't read this file type (${media || ext || 'unknown'}). Use a PDF, image, or CSV/Excel.` }
    }
    if (statement.transactions.length === 0) {
      return { ok: false, error: 'No transactions could be read from this statement.' }
    }

    // Dedupe hint: how many parsed rows already exist (same date + amount + description)?
    let possibleDuplicates = 0
    const clientId = await clientIdFor(supabase, slug)
    if (clientId) {
      const [{ data: d }, { data: c }, { data: cc }] = await Promise.all([
        supabase.from('deposits').select('txn_date, amount, description').eq('client_id', clientId).limit(100000),
        supabase.from('checking_expenses').select('txn_date, amount, description, check_num').eq('client_id', clientId).limit(100000),
        supabase.from('cc_transactions').select('post_date, amount, description').eq('client_id', clientId).limit(100000),
      ])
      const keys = new Set<string>()
      for (const r of d ?? []) keys.add(normKey(String(r.txn_date), Number(r.amount), String(r.description)))
      for (const r of c ?? []) keys.add(normKey(String(r.txn_date), Number(r.amount), String(r.description), (r as { check_num?: string | null }).check_num ?? null))
      for (const r of cc ?? []) keys.add(normKey(String(r.post_date), Number(r.amount), String(r.description)))
      possibleDuplicates = statement.transactions.filter((t) =>
        keys.has(normKey(t.date, t.amount, t.description, t.direction === 'out' ? t.check_num ?? null : null))
      ).length
    }

    return { ok: true, statement, possibleDuplicates }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Parse failed.' }
  }
}

type CommitResult =
  | { ok: true; inserted: number; reconciled: boolean; difference: number; hasBalances: boolean }
  | { ok: false; error: string }

// Route the parsed rows to the right tables, record the reconciliation, and
// auto-categorize.
export async function commitStatement(
  slug: string,
  payload: { storagePath: string; filename: string; statementType: 'bank' | 'card'; statement: ParsedStatement }
): Promise<CommitResult> {
  const supabase = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, error: 'Entity not found.' }

  const { statement, statementType } = payload
  const txns = statement.transactions

  // Reconciliation: does opening + activity tie to closing?
  const totalIn = txns.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0)
  const totalOut = txns.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0)
  const ob = statement.opening_balance
  const cb = statement.closing_balance
  const hasBalances = ob != null && cb != null
  let reconciled = false
  let difference = 0
  if (hasBalances) {
    const expected = statementType === 'bank' ? ob! + totalIn - totalOut : ob! + totalOut - totalIn
    difference = Math.round((cb! - expected) * 100) / 100
    reconciled = Math.abs(difference) < 0.01
  }

  // Statement-level idempotency: if this exact statement (same type + period +
  // balances) was already imported, refuse to import it again. Row-level dedup
  // can't catch OCR letter-jitter across re-parses of the same PDF, so we stop
  // the whole statement at the door — this is what prevents a 4x-imported
  // statement from ever stacking duplicates.
  {
    let q = supabase
      .from('statement_imports')
      .select('id', { head: true, count: 'exact' })
      .eq('client_id', clientId)
      .eq('statement_type', statementType)
    q = statement.period_start ? q.eq('period_start', statement.period_start) : q.is('period_start', null)
    q = statement.period_end ? q.eq('period_end', statement.period_end) : q.is('period_end', null)
    q = ob != null ? q.eq('opening_balance', ob) : q.is('opening_balance', null)
    q = cb != null ? q.eq('closing_balance', cb) : q.is('closing_balance', null)
    const { count: already } = await q
    if ((already ?? 0) > 0) {
      return { ok: true, inserted: 0, reconciled, difference, hasBalances }
    }
  }

  const inRows = txns.filter((t) => t.direction === 'in')
  const outRows = txns.filter((t) => t.direction === 'out')

  // Idempotent ingestion — the real cure for duplicate rows. Skip any parsed
  // row that already exists on the books (same normalized key), and skip
  // duplicates within this same batch. A re-import, an overlapping month, or a
  // re-upload under a new storage path becomes a no-op for rows already present
  // instead of stacking duplicates. (normKey folds away OCR jitter.)
  const [{ data: exD }, { data: exC }, { data: exCC }] = await Promise.all([
    supabase.from('deposits').select('txn_date, amount, description').eq('client_id', clientId).limit(100000),
    supabase.from('checking_expenses').select('txn_date, amount, description, check_num').eq('client_id', clientId).limit(100000),
    supabase.from('cc_transactions').select('post_date, amount, description').eq('client_id', clientId).limit(100000),
  ])
  const seenDep = new Set<string>()
  const seenChk = new Set<string>()
  const seenCc = new Set<string>()
  for (const r of exD ?? []) seenDep.add(normKey(String(r.txn_date), Number(r.amount), String(r.description)))
  for (const r of exC ?? [])
    seenChk.add(normKey(String(r.txn_date), Number(r.amount), String(r.description), (r as { check_num?: string | null }).check_num ?? null))
  for (const r of exCC ?? []) seenCc.add(normKey(String(r.post_date), Number(r.amount), String(r.description)))

  const freshDeposits: { date: string; description: string; amount: number }[] = []
  for (const t of inRows) {
    const k = normKey(t.date, t.amount, t.description)
    if (seenDep.has(k)) continue
    seenDep.add(k)
    freshDeposits.push({ date: t.date, description: t.description, amount: t.amount })
  }
  const freshChecking: { date: string; description: string; amount: number; check_num: string | null }[] = []
  for (const t of outRows) {
    const k = normKey(t.date, t.amount, t.description, t.check_num ?? null)
    if (seenChk.has(k)) continue
    seenChk.add(k)
    freshChecking.push({ date: t.date, description: t.description, amount: t.amount, check_num: t.check_num ?? null })
  }
  const freshCharges: { date: string; description: string; amount: number }[] = []
  for (const t of outRows) {
    const k = normKey(t.date, t.amount, t.description)
    if (seenCc.has(k)) continue
    seenCc.add(k)
    freshCharges.push({ date: t.date, description: t.description, amount: t.amount })
  }

  const plannedCount = statementType === 'bank' ? freshDeposits.length + freshChecking.length : freshCharges.length

  // Record the batch FIRST so every imported row can be tagged with its id —
  // that's what makes a re-import identifiable and an undo possible.
  const { data: rec, error: recErr } = await supabase
    .from('statement_imports')
    .insert({
      client_id: clientId,
      filename: payload.filename,
      storage_path: payload.storagePath,
      statement_type: statementType,
      period_start: statement.period_start,
      period_end: statement.period_end,
      opening_balance: ob,
      closing_balance: cb,
      total_in: Math.round(totalIn * 100) / 100,
      total_out: Math.round(totalOut * 100) / 100,
      inserted_count: plannedCount,
      reconciled,
      difference,
    })
    .select('id')
    .single()
  if (recErr || !rec) return { ok: false, error: recErr?.message || 'Could not record the import.' }
  const importId = rec.id as string

  const fail = async (msg: string): Promise<CommitResult> => {
    await supabase.from('statement_imports').delete().eq('id', importId) // roll back the batch record
    return { ok: false, error: msg }
  }

  let inserted = 0
  if (statementType === 'bank') {
    if (freshDeposits.length) {
      const rows = freshDeposits.map((t) => ({
        client_id: clientId,
        txn_date: t.date,
        description: t.description,
        amount: t.amount,
        import_id: importId,
      }))
      const { error } = await supabase.from('deposits').insert(rows)
      if (error) return fail(error.message)
      inserted += rows.length
    }
    if (freshChecking.length) {
      const rows = freshChecking.map((t) => ({
        client_id: clientId,
        txn_date: t.date,
        check_num: t.check_num,
        description: t.description,
        amount: t.amount,
        import_id: importId,
      }))
      const { error } = await supabase.from('checking_expenses').insert(rows)
      if (error) return fail(error.message)
      inserted += rows.length
    }
  } else {
    // Card: insert charges (out) only. Payments (in) are recorded on the bank
    // side (checking → Credit Card Payable), so inserting them here would
    // double-count — they're used for reconciliation math only.
    const label = payload.filename.replace(/\.[^.]+$/, '').slice(0, 60)
    if (freshCharges.length) {
      const rows = freshCharges.map((t) => ({
        client_id: clientId,
        post_date: t.date,
        txn_date: t.date,
        account: label,
        description: t.description,
        amount: t.amount,
        personal: false,
        import_id: importId,
      }))
      const { error } = await supabase.from('cc_transactions').insert(rows)
      if (error) return fail(error.message)
      inserted += rows.length
    }
  }

  // Auto-categorize the freshly imported rows against the chart.
  await autoCategorizeAll(slug)

  // Orchestrator: scan the newly-posted transactions for tax/payroll/sales-tax
  // signals — auto-satisfy matching obligations, raise proposals — and refresh
  // readiness. Best-effort: never let detection break a successful import.
  try {
    await scanAndMatch(supabase, clientId)
  } catch {
    await recomputeBySlug(supabase, slug)
  }

  revalidatePath(`/admin/clients/${slug}/statements`)
  revalidatePath(`/admin/clients/${slug}`)
  revalidatePath(`/admin/clients/${slug}/transactions`)
  revalidatePath(`/admin/clients/${slug}/expenses`)
  return { ok: true, inserted, reconciled, difference, hasBalances }
}

// Undo a statement import: delete every transaction tagged with the batch, then
// the batch record. RLS scopes deletes to entities the caller can write.
export async function undoImport(slug: string, importId: string, _fd?: FormData) {
  const supabase = await admin()
  await supabase.from('deposits').delete().eq('import_id', importId)
  await supabase.from('checking_expenses').delete().eq('import_id', importId)
  await supabase.from('cc_transactions').delete().eq('import_id', importId)
  await supabase.from('statement_imports').delete().eq('id', importId)
  await recomputeBySlug(supabase, slug)
  revalidatePath(`/admin/clients/${slug}/statements`)
  revalidatePath(`/admin/clients/${slug}`)
  revalidatePath(`/admin/clients/${slug}/transactions`)
  revalidatePath(`/admin/clients/${slug}/expenses`)
}

export type ScanStatementResult = { name: string; posted: number; reconciled: boolean | null; difference: number; type: 'bank' | 'card'; error?: string }
export type ScanResult =
  | { ok: true; processed: number; posted: number; statements: ScanStatementResult[] }
  | { ok: false; error: string }

// One-click batch: read every bank/card statement that's already been uploaded to
// Documents but never posted, extract its transactions, and commit them — the
// "Overseer, bring in everything you can find" action. Statement-level idempotent:
// a doc whose stored file already appears in statement_imports is skipped, so
// re-running only picks up what's new. Each committed batch stays undoable from
// the import history, and any statement that doesn't reconcile is flagged here.
export async function scanUploadedStatements(slug: string): Promise<ScanResult> {
  const supabase = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, error: 'Entity not found.' }

  const [{ data: docs }, { data: imported }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, name, storage_path, content_type, period_year, period_month')
      .eq('client_id', clientId)
      .eq('doc_type', 'bank_statement')
      .order('period_year', { ascending: true })
      .order('period_month', { ascending: true }),
    supabase.from('statement_imports').select('storage_path').eq('client_id', clientId),
  ])
  const done = new Set(
    ((imported ?? []) as { storage_path: string | null }[]).map((r) => r.storage_path).filter(Boolean)
  )
  const pending = ((docs ?? []) as {
    id: string
    name: string | null
    storage_path: string | null
    content_type: string | null
  }[]).filter((d) => d.storage_path && !done.has(d.storage_path))

  if (pending.length === 0) return { ok: true, processed: 0, posted: 0, statements: [] }

  const statements: ScanStatementResult[] = []
  let posted = 0
  for (const d of pending) {
    const name = d.name ?? 'Statement'
    try {
      const parsed = await parseStatementFile(slug, d.storage_path!, name, d.content_type ?? '')
      if (!parsed.ok) {
        statements.push({ name, posted: 0, reconciled: null, difference: 0, type: 'bank', error: parsed.error })
        continue
      }
      const stype: 'bank' | 'card' = parsed.statement.statement_type === 'card' ? 'card' : 'bank'
      const committed = await commitStatement(slug, {
        storagePath: d.storage_path!,
        filename: name,
        statementType: stype,
        statement: parsed.statement,
      })
      if (!committed.ok) {
        statements.push({ name, posted: 0, reconciled: null, difference: 0, type: stype, error: committed.error })
        continue
      }
      posted += committed.inserted
      statements.push({
        name,
        posted: committed.inserted,
        reconciled: committed.hasBalances ? committed.reconciled : null,
        difference: committed.difference,
        type: stype,
      })
    } catch (e) {
      statements.push({ name, posted: 0, reconciled: null, difference: 0, type: 'bank', error: e instanceof Error ? e.message : 'Failed to read.' })
    }
  }

  return { ok: true, processed: pending.length, posted, statements }
}

// Import ONE already-uploaded statement (parse + commit). Same work as the batch
// scan, but per-document so the client can drive them one at a time and show
// live progress. Returns that statement's result.
export async function importPendingStatement(
  slug: string,
  storagePath: string,
  filename: string,
  contentType: string
): Promise<ScanStatementResult> {
  try {
    const parsed = await parseStatementFile(slug, storagePath, filename, contentType)
    if (!parsed.ok) return { name: filename, posted: 0, reconciled: null, difference: 0, type: 'bank', error: parsed.error }
    const stype: 'bank' | 'card' = parsed.statement.statement_type === 'card' ? 'card' : 'bank'
    const committed = await commitStatement(slug, {
      storagePath,
      filename,
      statementType: stype,
      statement: parsed.statement,
    })
    if (!committed.ok) return { name: filename, posted: 0, reconciled: null, difference: 0, type: stype, error: committed.error }
    return {
      name: filename,
      posted: committed.inserted,
      reconciled: committed.hasBalances ? committed.reconciled : null,
      difference: committed.difference,
      type: stype,
    }
  } catch (e) {
    return { name: filename, posted: 0, reconciled: null, difference: 0, type: 'bank', error: e instanceof Error ? e.message : 'Failed to read.' }
  }
}

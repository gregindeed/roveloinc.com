'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { parseStatementDoc, parseStatementText, type ParsedStatement } from '@/lib/ai'
import { autoCategorizeAll } from './ledger-actions'
import { recomputeBySlug } from '@/lib/entityStateServer'
import { scanAndMatch } from '@/lib/signalsServer'
import { entityBase } from '@/lib/entityYear'

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

function spreadsheetToText(buf: ArrayBuffer): string {
  const wb = XLSX.read(buf, { type: 'array' })
  const parts: string[] = []
  for (const name of wb.SheetNames) parts.push(`# Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`)
  return parts.join('\n\n')
}

type ParseResult =
  | { ok: true; statement: ParsedStatement; possibleDuplicates: number }
  | { ok: false; error: string }

const dupeKey = (date: string, amount: number, desc: string) =>
  `${date}|${amount}|${(desc || '').trim().toLowerCase()}`

// Parse an already-uploaded statement file into structured line items + balances.
export async function parseStatementFile(
  slug: string,
  storagePath: string,
  filename: string,
  contentType: string
): Promise<ParseResult> {
  const supabase = await admin()
  const ext = (filename.split('.').pop() || '').toLowerCase()
  const media = contentType || ''
  const isPdf = media === 'application/pdf' || ext === 'pdf'
  const isImg = media.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
  const isSheet = ['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(ext) || /sheet|excel|csv/.test(media)
  const isText = media.startsWith('text/') || ['txt'].includes(ext)

  try {
    let statement: ParsedStatement
    if (isPdf || isImg) {
      const mt = isPdf ? 'application/pdf' : media.startsWith('image/') ? media : imgMime(ext)
      const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300)
      if (error || !signed?.signedUrl) return { ok: false, error: error?.message || 'Could not read the file.' }
      statement = await parseStatementDoc({ mediaType: mt, url: signed.signedUrl })
    } else if (isSheet) {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath)
      if (error || !blob) return { ok: false, error: error?.message || 'Could not download the file.' }
      statement = await parseStatementText(spreadsheetToText(await blob.arrayBuffer()))
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
        supabase.from('deposits').select('txn_date, amount, description').eq('client_id', clientId),
        supabase.from('checking_expenses').select('txn_date, amount, description').eq('client_id', clientId),
        supabase.from('cc_transactions').select('post_date, amount, description').eq('client_id', clientId),
      ])
      const keys = new Set<string>()
      for (const r of d ?? []) keys.add(dupeKey(String(r.txn_date), Number(r.amount), String(r.description)))
      for (const r of c ?? []) keys.add(dupeKey(String(r.txn_date), Number(r.amount), String(r.description)))
      for (const r of cc ?? []) keys.add(dupeKey(String(r.post_date), Number(r.amount), String(r.description)))
      possibleDuplicates = statement.transactions.filter((t) => keys.has(dupeKey(t.date, t.amount, t.description))).length
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

  const inRows = txns.filter((t) => t.direction === 'in')
  const outRows = txns.filter((t) => t.direction === 'out')
  const plannedCount = statementType === 'bank' ? inRows.length + outRows.length : outRows.length

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
    const deposits = inRows.map((t) => ({
      client_id: clientId,
      txn_date: t.date,
      description: t.description,
      amount: t.amount,
      import_id: importId,
    }))
    const checking = outRows.map((t) => ({
      client_id: clientId,
      txn_date: t.date,
      check_num: t.check_num ?? null,
      description: t.description,
      amount: t.amount,
      import_id: importId,
    }))
    if (deposits.length) {
      const { error } = await supabase.from('deposits').insert(deposits)
      if (error) return fail(error.message)
      inserted += deposits.length
    }
    if (checking.length) {
      const { error } = await supabase.from('checking_expenses').insert(checking)
      if (error) return fail(error.message)
      inserted += checking.length
    }
  } else {
    // Card: insert charges (out) only. Payments (in) are recorded on the bank
    // side (checking → Credit Card Payable), so inserting them here would
    // double-count — they're used for reconciliation math only.
    const label = payload.filename.replace(/\.[^.]+$/, '').slice(0, 60)
    const charges = outRows.map((t) => ({
      client_id: clientId,
      post_date: t.date,
      txn_date: t.date,
      account: label,
      description: t.description,
      amount: t.amount,
      personal: false,
      import_id: importId,
    }))
    if (charges.length) {
      const { error } = await supabase.from('cc_transactions').insert(charges)
      if (error) return fail(error.message)
      inserted += charges.length
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

  revalidatePath(`${entityBase(slug)}/statements`)
  revalidatePath(entityBase(slug))
  revalidatePath(`${entityBase(slug)}/transactions`)
  revalidatePath(`${entityBase(slug)}/expenses`)
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
  revalidatePath(`${entityBase(slug)}/statements`)
  revalidatePath(entityBase(slug))
  revalidatePath(`${entityBase(slug)}/transactions`)
  revalidatePath(`${entityBase(slug)}/expenses`)
}

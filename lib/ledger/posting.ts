import 'server-only'

import { createClient } from '@/lib/supabase/server'

// ── The posting engine ───────────────────────────────────────────────────────
// Every economic event becomes ONE balanced ledger transaction: a draft header,
// two-or-more debit/credit lines that sum equal, then flipped to 'posted'. The
// database triggers are the backstop (balance-on-post + posted-immutability);
// we also validate here so the caller gets a clean error instead of a raw
// Postgres exception. Supports compound entries (POS: cash/card-clearing +
// several revenue lines + tax + fee) — not just two-line entries.

export type NewLine = {
  accountId: string
  debit?: number
  credit?: number
  description?: string | null
  customerId?: string | null
  vendorId?: string | null
  propertyId?: string | null
  locationId?: string | null
  productId?: string | null
  taxCodeId?: string | null
}

export type NewTransaction = {
  clientId: string
  txnType: string
  sourceType?: string | null
  sourceId?: string | null
  documentDate: string // YYYY-MM-DD
  postingDate?: string | null
  memo?: string | null
  reversalOfId?: string | null
  createdBy?: string | null
  lines: NewLine[]
}

export type PostResult = { ok: true; id: string; humanId: string } | { ok: false; error: string }

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

const HUMAN_PREFIX: Record<string, string> = {
  cash_receipt: 'CR',
  invoice: 'INV',
  invoice_payment: 'PMT',
  sales_receipt: 'SR',
  pos_batch: 'POS',
  bank_deposit: 'DEP',
  processor_settlement: 'SET',
  refund: 'RF',
  credit_memo: 'CM',
  transfer: 'TR',
  manual_journal: 'JE',
  expense: 'EX',
  bill: 'BILL',
  reversal: 'REV',
}

type DB = ReturnType<typeof createClient>

// A readable id like JE-2025-00042. Count-based — fine at this volume; a proper
// per-entity sequence can replace it later without touching callers.
async function nextHumanId(db: DB, clientId: string, txnType: string, date: string): Promise<string> {
  const prefix = HUMAN_PREFIX[txnType] ?? 'TX'
  const year = (date || '').slice(0, 4) || '0000'
  const { count } = await db
    .from('ledger_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .like('human_id', `${prefix}-${year}-%`)
  return `${prefix}-${year}-${String((count ?? 0) + 1).padStart(5, '0')}`
}

// Validate + post one balanced transaction. Returns the id or a clean error.
export async function postTransaction(t: NewTransaction): Promise<PostResult> {
  const db = createClient()

  const lines = (t.lines ?? []).map((l) => ({
    ...l,
    debit: round2(l.debit ?? 0),
    credit: round2(l.credit ?? 0),
  }))

  // Shape checks (mirror the DB constraints, but with friendly messages).
  if (lines.length < 2) return { ok: false, error: 'A transaction needs at least two lines.' }
  for (const l of lines) {
    if (!l.accountId) return { ok: false, error: 'Every line needs an account.' }
    if (l.debit < 0 || l.credit < 0) return { ok: false, error: 'Amounts cannot be negative.' }
    if (l.debit > 0 && l.credit > 0) return { ok: false, error: 'A line is either a debit or a credit, not both.' }
    if (l.debit === 0 && l.credit === 0) return { ok: false, error: 'Every line needs a non-zero amount.' }
  }
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0))
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0))
  if (totalDebit === 0) return { ok: false, error: 'The entry total is zero.' }
  if (totalDebit !== totalCredit) {
    return { ok: false, error: `Unbalanced: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}.` }
  }

  const documentDate = t.documentDate
  const postingDate = t.postingDate || documentDate
  const humanId = await nextHumanId(db, t.clientId, t.txnType, documentDate)

  // 1) draft header
  const { data: header, error: hErr } = await db
    .from('ledger_transactions')
    .insert({
      client_id: t.clientId,
      human_id: humanId,
      txn_type: t.txnType,
      source_type: t.sourceType ?? null,
      source_id: t.sourceId ?? null,
      document_date: documentDate,
      posting_date: postingDate,
      status: 'draft',
      memo: t.memo ?? null,
      reversal_of_id: t.reversalOfId ?? null,
      created_by: t.createdBy ?? null,
    })
    .select('id')
    .single()
  if (hErr || !header) return { ok: false, error: hErr?.message ?? 'Could not create the transaction.' }
  const id = header.id as string

  // 2) lines (parent is still draft, so inserts are allowed)
  const rows = lines.map((l) => ({
    transaction_id: id,
    client_id: t.clientId,
    account_id: l.accountId,
    debit: l.debit,
    credit: l.credit,
    description: l.description ?? null,
    customer_id: l.customerId ?? null,
    vendor_id: l.vendorId ?? null,
    property_id: l.propertyId ?? null,
    location_id: l.locationId ?? null,
    product_id: l.productId ?? null,
    tax_code_id: l.taxCodeId ?? null,
  }))
  const { error: lErr } = await db.from('ledger_lines').insert(rows)
  if (lErr) {
    await db.from('ledger_transactions').delete().eq('id', id) // draft rollback
    return { ok: false, error: lErr.message }
  }

  // 3) post — the DB trigger re-checks the balance as the final authority
  const { error: pErr } = await db.from('ledger_transactions').update({ status: 'posted' }).eq('id', id)
  if (pErr) {
    await db.from('ledger_lines').delete().eq('transaction_id', id)
    await db.from('ledger_transactions').delete().eq('id', id)
    return { ok: false, error: pErr.message }
  }

  return { ok: true, id, humanId }
}

// Reverse a posted transaction: a new transaction with every debit/credit
// mirrored, linked by reversal_of_id. The original stays posted and immutable;
// to fix an entry you reverse it, then post a corrected one.
export async function reverseTransaction(clientId: string, txnId: string): Promise<PostResult> {
  const db = createClient()

  const { data: orig } = await db
    .from('ledger_transactions')
    .select('id, status, human_id, document_date')
    .eq('id', txnId)
    .eq('client_id', clientId)
    .single()
  if (!orig) return { ok: false, error: 'Transaction not found.' }
  if (orig.status !== 'posted') return { ok: false, error: 'Only posted transactions can be reversed.' }

  const { data: already } = await db
    .from('ledger_transactions')
    .select('id')
    .eq('reversal_of_id', txnId)
    .maybeSingle()
  if (already) return { ok: false, error: 'This transaction has already been reversed.' }

  const { data: lines } = await db
    .from('ledger_lines')
    .select('account_id, debit, credit, description, customer_id, vendor_id, property_id, location_id, product_id, tax_code_id')
    .eq('transaction_id', txnId)
  if (!lines || lines.length === 0) return { ok: false, error: 'Original has no lines to reverse.' }

  const mirrored: NewLine[] = lines.map((l) => ({
    accountId: l.account_id as string,
    debit: Number(l.credit) || 0, // swap
    credit: Number(l.debit) || 0,
    description: (l.description as string | null) ?? null,
    customerId: (l.customer_id as string | null) ?? null,
    vendorId: (l.vendor_id as string | null) ?? null,
    propertyId: (l.property_id as string | null) ?? null,
    locationId: (l.location_id as string | null) ?? null,
    productId: (l.product_id as string | null) ?? null,
    taxCodeId: (l.tax_code_id as string | null) ?? null,
  }))

  return postTransaction({
    clientId,
    txnType: 'reversal',
    sourceType: 'reversal',
    sourceId: null,
    reversalOfId: txnId,
    documentDate: (orig.document_date as string) ?? new Date().toISOString().slice(0, 10),
    memo: `Reversal of ${orig.human_id ?? txnId}`,
    lines: mirrored,
  })
}

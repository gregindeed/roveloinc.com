import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/types'
import { detectTransactions, type TxnInput, type Candidate } from '@/lib/signals'
import { recomputeAndPersist } from '@/lib/entityStateServer'
import { logEvent } from '@/lib/registryServer'

type DB = ReturnType<typeof createClient>

const daysApart = (a: string, b: string) =>
  Math.abs((new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86400000)

// Which compliance profile field maps to which obligation agencies — used to
// decide whether a detected activity is already accounted for.
const FIELD_AGENCIES: Record<string, string[]> = {
  has_employees: ['edd', 'irs'],
  collects_sales_tax: ['cdtfa'],
  files_franchise_tax: ['ftb'],
}
const FIELD_LABEL: Record<string, string> = {
  has_employees: 'payroll (EDD DE-9, IRS 941/940)',
  collects_sales_tax: 'sales tax (CDTFA returns)',
  files_franchise_tax: 'FTB franchise/income tax',
}

export type ScanResult = { evidence: number; satisfied: number; proposals: number }

// Read the transactions already on file, record what they imply, auto-satisfy
// matching obligations, and raise proposals for activity the profile misses.
export async function scanAndMatch(supabase: DB, clientId: string): Promise<ScanResult> {
  const { data: clientRow } = await supabase.from('clients').select('*').eq('id', clientId).single()
  if (!clientRow) return { evidence: 0, satisfied: 0, proposals: 0 }
  const client = clientRow as Client

  const [{ data: deposits }, { data: checking }, { data: cc }] = await Promise.all([
    supabase.from('deposits').select('id, txn_date, description, amount').eq('client_id', clientId),
    supabase.from('checking_expenses').select('id, txn_date, description, amount').eq('client_id', clientId),
    supabase.from('cc_transactions').select('id, post_date, description, amount').eq('client_id', clientId),
  ])

  const inputs: TxnInput[] = [
    ...(deposits ?? []).map((r) => ({
      source_table: 'deposits' as const,
      source_id: String(r.id),
      date: r.txn_date as string,
      description: (r.description as string) ?? '',
      amount: Number(r.amount),
      direction: 'in' as const,
    })),
    ...(checking ?? []).map((r) => ({
      source_table: 'checking_expenses' as const,
      source_id: String(r.id),
      date: r.txn_date as string,
      description: (r.description as string) ?? '',
      amount: Number(r.amount),
      direction: 'out' as const,
    })),
    ...(cc ?? []).map((r) => ({
      source_table: 'cc_transactions' as const,
      source_id: String(r.id),
      date: r.post_date as string,
      description: (r.description as string) ?? '',
      amount: Number(r.amount),
      direction: 'out' as const,
    })),
  ]

  const candidates = detectTransactions(inputs)

  // 1) Persist evidence rows (don't clobber ones already applied/dismissed).
  if (candidates.length > 0) {
    const rows = candidates.map((c) => ({
      client_id: clientId,
      type: c.type,
      agency: c.agency,
      summary: c.summary,
      confidence: c.confidence,
      source_table: c.source_table,
      source_id: c.source_id,
      amount: c.amount,
      txn_date: c.txn_date,
      status: 'open',
    }))
    await supabase
      .from('detected_signals')
      .upsert(rows, { onConflict: 'client_id,type,source_table,source_id', ignoreDuplicates: true })
  }

  // 2) Auto-satisfy obligations from detected tax PAYMENTS (money out to an agency).
  const [{ data: obligations }, { data: events }] = await Promise.all([
    supabase.from('obligations').select('id, agency').eq('client_id', clientId),
    supabase
      .from('obligation_events')
      .select('id, obligation_id, due_date, status, satisfied_by_txn')
      .eq('client_id', clientId),
  ])
  const agencyByOb = new Map((obligations ?? []).map((o) => [o.id as string, o.agency as string]))
  const enrolledAgencies = new Set((obligations ?? []).map((o) => o.agency as string))

  const openEvents = (events ?? [])
    .filter((e) => !['paid', 'filed', 'waived'].includes(e.status as string) && !e.satisfied_by_txn)
    .map((e) => ({ id: e.id as string, agency: agencyByOb.get(e.obligation_id as string) ?? null, due: e.due_date as string }))

  const used = new Set<string>()
  let satisfied = 0
  const payments = candidates
    // Only a genuine direct-to-agency payment may clear an obligation. Payroll-
    // provider debits (ADP/Gusto/…) are satisfiesObligation:false, so an ADP fee
    // can no longer auto-mark an EDD/941 filing paid.
    .filter((c) => c.direction === 'out' && c.agency && c.satisfiesObligation)
    .sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1))

  for (const p of payments) {
    const match = openEvents
      .filter((e) => !used.has(e.id) && e.agency === p.agency && daysApart(e.due, p.txn_date) <= 60)
      .sort((a, b) => daysApart(a.due, p.txn_date) - daysApart(b.due, p.txn_date))[0]
    if (!match) continue
    used.add(match.id)
    await supabase
      .from('obligation_events')
      .update({
        status: 'paid',
        paid_date: p.txn_date,
        amount_paid: p.amount,
        satisfied_by_txn: `${p.source_table}:${p.source_id}`,
        satisfied_auto: true,
      })
      .eq('id', match.id)
    await supabase
      .from('detected_signals')
      .update({ status: 'applied' })
      .eq('client_id', clientId)
      .eq('source_table', p.source_table)
      .eq('source_id', p.source_id)
    await logEvent(supabase, clientId, {
      kind: 'filing',
      source: 'overseer',
      title: `Cleared a ${(p.agency ?? '').toUpperCase()} filing — I matched a payment in the books.`,
      detail: `${p.summary}`,
    })
    satisfied += 1
  }

  // 3) Raise proposals for detected activity the profile doesn't reflect yet.
  let proposals = 0
  const fieldsSeen = new Set(
    candidates
      .map((c) => c.proposesField)
      .filter((f): f is NonNullable<Candidate['proposesField']> => !!f)
  )
  for (const field of fieldsSeen) {
    const already = (client as unknown as Record<string, unknown>)[field] === true
    const enrolled = (FIELD_AGENCIES[field] ?? []).some((a) => enrolledAgencies.has(a))
    if (already || enrolled) continue
    const { error } = await supabase.from('detected_signals').upsert(
      {
        client_id: clientId,
        type: `propose_${field}`,
        agency: null,
        summary: `Transactions show ${FIELD_LABEL[field] ?? field}, but this entity isn’t set up for it. Enroll the obligations?`,
        confidence: 0.8,
        source_table: 'proposal',
        source_id: field,
        status: 'open',
        proposed_action: { field },
      },
      { onConflict: 'client_id,type,source_table,source_id', ignoreDuplicates: true }
    )
    if (!error) {
      proposals += 1
      await logEvent(supabase, clientId, {
        kind: 'proposal',
        source: 'overseer',
        title: `Noticed ${FIELD_LABEL[field] ?? field} in the transactions.`,
        detail: 'This entity may owe those obligations — I proposed enrolling them for your confirmation.',
      })
    }
  }

  await recomputeAndPersist(supabase, clientId)
  return { evidence: candidates.length, satisfied, proposals }
}

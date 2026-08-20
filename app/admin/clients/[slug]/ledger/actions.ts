'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { postTransaction, reverseTransaction, type PostResult } from '@/lib/ledger/posting'
import { postBankRows } from '@/lib/ledger/bankBridge'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return { supabase, userId: user.id }
}

async function clientIdFor(supabase: ReturnType<typeof createClient>, slug: string): Promise<string | null> {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return (data?.id as string) ?? null
}

export type ManualLine = { accountId: string; debit: number; credit: number; description?: string }

// Create a manual journal entry — the direct way to exercise the ledger: a
// balanced multi-line entry the operator composes. (Adjusting entries, opening
// balances, corrections.)
export async function createManualJournal(
  slug: string,
  payload: { documentDate: string; memo: string; lines: ManualLine[] }
): Promise<PostResult> {
  const { supabase, userId } = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, error: 'Entity not found.' }

  const res = await postTransaction({
    clientId,
    txnType: 'manual_journal',
    sourceType: 'manual',
    documentDate: payload.documentDate,
    memo: payload.memo?.trim() || null,
    createdBy: userId,
    lines: (payload.lines ?? []).map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description?.trim() || null,
    })),
  })
  if (res.ok) {
    revalidatePath(`/admin/clients/${slug}/ledger`)
    revalidatePath(`/admin/clients/${slug}`)
  }
  return res
}

// Post all categorized-but-unposted bank activity (deposits, checking, card) into
// the ledger. Remembers the chosen bank + card-payable accounts on the entity.
export async function postBankActivity(
  slug: string,
  bankAccountId: string,
  cardAccountId: string | null,
  since?: string | null
): Promise<{ ok: boolean; posted: number; skipped: number; error?: string }> {
  const { supabase, userId } = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, posted: 0, skipped: 0, error: 'Entity not found.' }
  if (!bankAccountId) return { ok: false, posted: 0, skipped: 0, error: 'Choose your bank account first.' }

  await supabase
    .from('clients')
    .update({ ledger_bank_account_id: bankAccountId, ledger_card_account_id: cardAccountId || null })
    .eq('id', clientId)

  const { posted, skipped } = await postBankRows(supabase, clientId, userId, bankAccountId, cardAccountId || null, since ?? null)

  revalidatePath(`/admin/clients/${slug}/ledger`)
  revalidatePath(`/admin/clients/${slug}`)
  revalidatePath(`/admin/clients/${slug}/transactions`)
  return { ok: true, posted, skipped }
}

export async function reverseLedgerTxn(slug: string, txnId: string): Promise<PostResult> {
  const { supabase } = await admin()
  const clientId = await clientIdFor(supabase, slug)
  if (!clientId) return { ok: false, error: 'Entity not found.' }
  const res = await reverseTransaction(clientId, txnId)
  if (res.ok) {
    revalidatePath(`/admin/clients/${slug}/ledger`)
    revalidatePath(`/admin/clients/${slug}`)
  }
  return res
}

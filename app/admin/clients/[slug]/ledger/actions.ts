'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { postTransaction, reverseTransaction, type PostResult } from '@/lib/ledger/posting'

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

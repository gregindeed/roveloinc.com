'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function admin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/portal')
  return supabase
}

async function clientId(supabase: Awaited<ReturnType<typeof admin>>, slug: string) {
  const { data } = await supabase.from('clients').select('id').eq('slug', slug).single()
  return data?.id as string | undefined
}

const S = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : v
}
const N = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v === '' ? null : Number(v)
}
const revT = (slug: string) => revalidatePath(`/admin/clients/${slug}/transactions`)
const revE = (slug: string) => revalidatePath(`/admin/clients/${slug}/expenses`)

/* ---------------- Deposits ---------------- */
export async function addDeposit(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  const txn_date = S(fd, 'txn_date')
  const description = S(fd, 'description')
  const amount = N(fd, 'amount')
  if (!cid || !txn_date || !description || amount == null) return
  await s.from('deposits').insert({
    client_id: cid,
    txn_date,
    description,
    type: S(fd, 'type'),
    category: S(fd, 'category'),
    amount,
  })
  revT(slug)
}
export async function updateDeposit(slug: string, id: string, fd: FormData) {
  const s = await admin()
  await s
    .from('deposits')
    .update({
      txn_date: S(fd, 'txn_date'),
      description: S(fd, 'description'),
      category: S(fd, 'category'),
      amount: N(fd, 'amount'),
    })
    .eq('id', id)
  revT(slug)
}
export async function deleteDeposit(slug: string, id: string) {
  const s = await admin()
  await s.from('deposits').delete().eq('id', id)
  revT(slug)
}

/* ---------------- Checking expenses ---------------- */
export async function addChecking(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  const txn_date = S(fd, 'txn_date')
  const description = S(fd, 'description')
  const amount = N(fd, 'amount')
  if (!cid || !txn_date || !description || amount == null) return
  await s.from('checking_expenses').insert({
    client_id: cid,
    txn_date,
    check_num: S(fd, 'check_num'),
    description,
    category: S(fd, 'category'),
    amount,
  })
  revE(slug)
}
export async function updateChecking(slug: string, id: string, fd: FormData) {
  const s = await admin()
  await s
    .from('checking_expenses')
    .update({
      txn_date: S(fd, 'txn_date'),
      check_num: S(fd, 'check_num'),
      description: S(fd, 'description'),
      category: S(fd, 'category'),
      amount: N(fd, 'amount'),
    })
    .eq('id', id)
  revE(slug)
}
export async function deleteChecking(slug: string, id: string) {
  const s = await admin()
  await s.from('checking_expenses').delete().eq('id', id)
  revE(slug)
}

/* ---------------- Credit-card transactions ---------------- */
export async function addCC(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  const date = S(fd, 'date')
  const description = S(fd, 'description')
  const amount = N(fd, 'amount')
  if (!cid || !date || !description || amount == null) return
  await s.from('cc_transactions').insert({
    client_id: cid,
    post_date: date,
    txn_date: date,
    account: S(fd, 'account'),
    description,
    category: S(fd, 'category'),
    amount,
    personal: fd.get('personal') === 'on',
  })
  revE(slug)
}
export async function updateCC(slug: string, id: string, fd: FormData) {
  const s = await admin()
  const date = S(fd, 'date')
  await s
    .from('cc_transactions')
    .update({
      post_date: date,
      txn_date: date,
      account: S(fd, 'account'),
      description: S(fd, 'description'),
      category: S(fd, 'category'),
      amount: N(fd, 'amount'),
      personal: fd.get('personal') === 'on',
    })
    .eq('id', id)
  revE(slug)
}
export async function deleteCC(slug: string, id: string) {
  const s = await admin()
  await s.from('cc_transactions').delete().eq('id', id)
  revE(slug)
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isYearClosed } from '@/lib/yearsServer'
import { entityBase } from '@/lib/entityYear'

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

// A real calendar date in YYYY-MM-DD form (the <input type="date"> format).
const isDate = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

type Tab = 'transactions' | 'expenses'
const fail = (slug: string, tab: Tab, msg: string): never =>
  redirect(`${entityBase(slug)}/${tab}?warn=${encodeURIComponent(msg)}`)

// Shared validation for a transaction row. Returns a clean {date, description,
// amount} or redirects with a warning. `dateKey` differs across tables.
function requireRow(fd: FormData, slug: string, tab: Tab, dateKey = 'txn_date') {
  const date = S(fd, dateKey)
  const description = S(fd, 'description')
  const amount = N(fd, 'amount')
  if (!isDate(date)) fail(slug, tab, 'Enter a valid date (YYYY-MM-DD).')
  if (!description) fail(slug, tab, 'A description is required.')
  if (amount == null || !Number.isFinite(amount)) fail(slug, tab, 'Enter a valid dollar amount.')
  return { date: date as string, description: description as string, amount: amount as number }
}

const revT = (slug: string) => revalidatePath(`${entityBase(slug)}/transactions`)
const revE = (slug: string) => revalidatePath(`${entityBase(slug)}/expenses`)

// A closed tax year is read-only — block writes dated inside it.
async function assertYearOpen(s: Awaited<ReturnType<typeof admin>>, cid: string, date: string, slug: string, tab: Tab) {
  const year = Number(date.slice(0, 4))
  if (year && (await isYearClosed(s, cid, year))) {
    fail(slug, tab, `Tax year ${year} is closed. Reopen it to make changes.`)
  }
}

/* ---------------- Deposits ---------------- */
export async function addDeposit(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  if (!cid) fail(slug, 'transactions', 'Entity not found.')
  const row = requireRow(fd, slug, 'transactions')
  await assertYearOpen(s, cid!, row.date, slug, 'transactions')
  const { error } = await s.from('deposits').insert({
    client_id: cid,
    txn_date: row.date,
    description: row.description,
    type: S(fd, 'type'),
    account_id: S(fd, 'account_id'),
    amount: row.amount,
  })
  if (error) fail(slug, 'transactions', `Could not add deposit: ${error.message}`)
  revT(slug)
}
export async function updateDeposit(slug: string, id: string, fd: FormData) {
  const s = await admin()
  const row = requireRow(fd, slug, 'transactions')
  const { error } = await s
    .from('deposits')
    .update({
      txn_date: row.date,
      description: row.description,
      account_id: S(fd, 'account_id'),
      amount: row.amount,
    })
    .eq('id', id)
  if (error) fail(slug, 'transactions', `Could not save deposit: ${error.message}`)
  revT(slug)
}
export async function deleteDeposit(slug: string, id: string) {
  const s = await admin()
  const { error } = await s.from('deposits').delete().eq('id', id)
  if (error) fail(slug, 'transactions', `Could not delete deposit: ${error.message}`)
  revT(slug)
}

/* ---------------- Checking expenses ---------------- */
export async function addChecking(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  if (!cid) fail(slug, 'expenses', 'Entity not found.')
  const row = requireRow(fd, slug, 'expenses')
  await assertYearOpen(s, cid!, row.date, slug, 'expenses')
  const { error } = await s.from('checking_expenses').insert({
    client_id: cid,
    txn_date: row.date,
    check_num: S(fd, 'check_num'),
    description: row.description,
    account_id: S(fd, 'account_id'),
    amount: row.amount,
  })
  if (error) fail(slug, 'expenses', `Could not add expense: ${error.message}`)
  revE(slug)
}
export async function updateChecking(slug: string, id: string, fd: FormData) {
  const s = await admin()
  const row = requireRow(fd, slug, 'expenses')
  const { error } = await s
    .from('checking_expenses')
    .update({
      txn_date: row.date,
      check_num: S(fd, 'check_num'),
      description: row.description,
      account_id: S(fd, 'account_id'),
      amount: row.amount,
    })
    .eq('id', id)
  if (error) fail(slug, 'expenses', `Could not save expense: ${error.message}`)
  revE(slug)
}
export async function deleteChecking(slug: string, id: string) {
  const s = await admin()
  const { error } = await s.from('checking_expenses').delete().eq('id', id)
  if (error) fail(slug, 'expenses', `Could not delete expense: ${error.message}`)
  revE(slug)
}

/* ---------------- Credit-card transactions ---------------- */
export async function addCC(slug: string, fd: FormData) {
  const s = await admin()
  const cid = await clientId(s, slug)
  if (!cid) fail(slug, 'expenses', 'Entity not found.')
  const row = requireRow(fd, slug, 'expenses', 'date')
  await assertYearOpen(s, cid!, row.date, slug, 'expenses')
  const { error } = await s.from('cc_transactions').insert({
    client_id: cid,
    post_date: row.date,
    txn_date: row.date,
    account: S(fd, 'account'),
    description: row.description,
    account_id: S(fd, 'account_id'),
    amount: row.amount,
    personal: fd.get('personal') === 'on',
  })
  if (error) fail(slug, 'expenses', `Could not add card transaction: ${error.message}`)
  revE(slug)
}
export async function updateCC(slug: string, id: string, fd: FormData) {
  const s = await admin()
  const row = requireRow(fd, slug, 'expenses', 'date')
  const { error } = await s
    .from('cc_transactions')
    .update({
      post_date: row.date,
      txn_date: row.date,
      account: S(fd, 'account'),
      description: row.description,
      account_id: S(fd, 'account_id'),
      amount: row.amount,
      personal: fd.get('personal') === 'on',
    })
    .eq('id', id)
  if (error) fail(slug, 'expenses', `Could not save card transaction: ${error.message}`)
  revE(slug)
}
export async function deleteCC(slug: string, id: string) {
  const s = await admin()
  const { error } = await s.from('cc_transactions').delete().eq('id', id)
  if (error) fail(slug, 'expenses', `Could not delete card transaction: ${error.message}`)
  revE(slug)
}

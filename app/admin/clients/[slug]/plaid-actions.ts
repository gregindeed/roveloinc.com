'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkToken } from '@/lib/plaid'
import { connectItem, syncClient, disconnectItem } from '@/lib/plaidServer'
import { autoCategorizeAll } from './ledger-actions'
import { entityBase } from '@/lib/entityYear'

async function worker() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'collaborator') redirect('/portal')
  return supabase
}

async function clientBySlug(supabase: ReturnType<typeof createClient>, slug: string) {
  const { data } = await supabase.from('clients').select('id, name').eq('slug', slug).single()
  return data as { id: string; name: string } | null
}

function webhookUrl(): string | undefined {
  const site = process.env.SITE_URL
  const secret = process.env.PLAID_WEBHOOK_SECRET
  if (!site || !site.startsWith('https') || !secret) return undefined
  return `${site}/api/plaid/webhook?key=${encodeURIComponent(secret)}`
}

const revalidate = (slug: string) => {
  const base = entityBase(slug)
  revalidatePath(`${base}/statements`)
  revalidatePath(base)
  revalidatePath(`${base}/transactions`)
  revalidatePath(`${base}/expenses`)
}

// Create a Plaid Link token for the browser to open Plaid Link with.
export async function createLinkTokenAction(slug: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const supabase = await worker()
  const client = await clientBySlug(supabase, slug)
  if (!client) return { ok: false, error: 'Entity not found.' }
  try {
    const token = await createLinkToken(client.id, client.name, webhookUrl())
    return { ok: true, token }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not start Plaid.' }
  }
}

// Exchange the public token from a successful Link flow and pull transactions.
export async function exchangeToken(slug: string, publicToken: string): Promise<{ ok: boolean; added?: number; error?: string }> {
  const supabase = await worker()
  const client = await clientBySlug(supabase, slug)
  if (!client) return { ok: false, error: 'Entity not found.' }
  const admin = createAdminClient()
  const res = await connectItem(admin, client.id, client.name, publicToken)
  if (!res.ok) return { ok: false, error: res.error }
  try {
    await autoCategorizeAll(slug)
  } catch {
    // categorization is best-effort
  }
  revalidate(slug)
  return { ok: true, added: res.added }
}

export async function syncNow(slug: string) {
  const supabase = await worker()
  const client = await clientBySlug(supabase, slug)
  if (!client) return
  const admin = createAdminClient()
  await syncClient(admin, client.id)
  try {
    await autoCategorizeAll(slug)
  } catch {
    // best-effort
  }
  revalidate(slug)
}

export async function disconnectBank(slug: string, itemId: string) {
  await worker()
  const admin = createAdminClient()
  await disconnectItem(admin, itemId)
  revalidate(slug)
}

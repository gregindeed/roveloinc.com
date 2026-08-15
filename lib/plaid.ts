import 'server-only'

// Minimal, edge-safe Plaid client — raw fetch, no SDK (like our Anthropic/Resend
// calls), so it runs on Cloudflare Workers. Credentials live in env; the client
// id + secret go in the request body per Plaid's convention.

const ENV = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase()
const BASE = ENV === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com'

function creds() {
  const client_id = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!client_id || !secret) throw new Error('PLAID_CLIENT_ID / PLAID_SECRET are not set')
  return { client_id, secret }
}

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds(), ...body }),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = (json && (json.error_message || json.error_code)) || `Plaid ${res.status}`
    throw new Error(`Plaid ${path}: ${msg}`)
  }
  return json as T
}

// A link_token drives the Plaid Link UI on the client. webhookUrl (optional)
// makes Plaid notify us when new transactions are ready.
export async function createLinkToken(clientUserId: string, clientName: string, webhookUrl?: string): Promise<string> {
  const { link_token } = await plaid<{ link_token: string }>('/link/token/create', {
    user: { client_user_id: clientUserId },
    client_name: clientName.slice(0, 30) || 'Rovelo Inc',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
    ...(webhookUrl ? { webhook: webhookUrl } : {}),
  })
  return link_token
}

export async function exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const r = await plaid<{ access_token: string; item_id: string }>('/item/public_token/exchange', {
    public_token: publicToken,
  })
  return { accessToken: r.access_token, itemId: r.item_id }
}

export async function institutionName(accessToken: string): Promise<string | null> {
  try {
    const item = await plaid<{ item: { institution_id?: string } }>('/item/get', { access_token: accessToken })
    const id = item.item?.institution_id
    if (!id) return null
    const inst = await plaid<{ institution: { name: string } }>('/institutions/get_by_id', {
      institution_id: id,
      country_codes: ['US'],
    })
    return inst.institution?.name ?? null
  } catch {
    return null
  }
}

export type PlaidAccount = { account_id: string; type: string; subtype: string | null; name: string }
export type PlaidTxn = {
  transaction_id: string
  account_id: string
  amount: number
  date: string
  name: string
  merchant_name: string | null
  pending: boolean
}

export async function getAccounts(accessToken: string): Promise<PlaidAccount[]> {
  const r = await plaid<{ accounts: PlaidAccount[] }>('/accounts/get', { access_token: accessToken })
  return r.accounts ?? []
}

// One page of transactions/sync. Loop on has_more using the returned cursor.
export async function syncTransactions(
  accessToken: string,
  cursor: string | null
): Promise<{ added: PlaidTxn[]; modified: PlaidTxn[]; removed: string[]; nextCursor: string; hasMore: boolean }> {
  const r = await plaid<{
    added: PlaidTxn[]
    modified: PlaidTxn[]
    removed: { transaction_id: string }[]
    next_cursor: string
    has_more: boolean
  }>('/transactions/sync', { access_token: accessToken, ...(cursor ? { cursor } : {}), count: 500 })
  return {
    added: r.added ?? [],
    modified: r.modified ?? [],
    removed: (r.removed ?? []).map((x) => x.transaction_id),
    nextCursor: r.next_cursor,
    hasMore: r.has_more,
  }
}

export async function removeItem(accessToken: string): Promise<void> {
  try {
    await plaid('/item/remove', { access_token: accessToken })
  } catch {
    // best-effort — we still drop our record
  }
}

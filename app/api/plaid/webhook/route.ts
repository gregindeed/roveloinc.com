import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncItem, type PlaidItemRow } from '@/lib/plaidServer'
import { verifyPlaidWebhook } from '@/lib/plaidWebhook'

export const dynamic = 'force-dynamic'

// Plaid calls this when new transactions are ready. Two layers of trust:
//   1) a shared secret in the URL (?key=…) — the only shared secret Plaid webhooks
//      support, since Plaid can't send custom auth headers; a cheap first gate.
//   2) Plaid's signed JWT (Plaid-Verification header) — the real authenticity
//      check: signature + body-hash + freshness. Required in production; in
//      sandbox we allow an unsigned call (still gated by the secret) so test
//      webhooks aren't blocked.
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!process.env.PLAID_WEBHOOK_SECRET || key !== process.env.PLAID_WEBHOOK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Read the RAW body once — needed to verify the signature's body hash — then
  // parse it ourselves (can't use req.json() after reading the body).
  const rawBody = await req.text()

  const verification = req.headers.get('Plaid-Verification')
  const isProd = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase() === 'production'
  if (verification) {
    const valid = await verifyPlaidWebhook(rawBody, verification)
    if (!valid) return new NextResponse('Invalid signature', { status: 401 })
  } else if (isProd) {
    // Production webhooks are always signed — a missing header is not legitimate.
    return new NextResponse('Missing signature', { status: 401 })
  }

  let body: { webhook_type?: string; item_id?: string } | null = null
  try {
    body = JSON.parse(rawBody)
  } catch {
    body = null
  }
  if (!body?.item_id || body.webhook_type !== 'TRANSACTIONS') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const admin = createAdminClient()
  const { data: item } = await admin
    .from('plaid_items')
    .select('id, client_id, access_token, cursor, institution_name')
    .eq('item_id', body.item_id)
    .eq('status', 'active')
    .single()
  if (item) {
    try {
      await syncItem(admin, item as PlaidItemRow)
    } catch {
      // best-effort; Plaid will retry
    }
  }
  return NextResponse.json({ ok: true })
}

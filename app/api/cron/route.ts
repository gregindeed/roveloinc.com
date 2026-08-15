import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeAndPersist } from '@/lib/entityStateServer'
import { deriveAttention, type StateRow } from '@/lib/brief'
import { sendEmail, firmDigestEmailHtml, type DigestItem } from '@/lib/email'
import type { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type DB = ReturnType<typeof createClient>

// Constant-time string compare so the secret check doesn't leak via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// Always-on heartbeat: recompute every entity's readiness and email each firm a
// deterministic (no-LLM) brief of the clients that need attention. Triggered on
// a schedule by a tiny standalone Cron Worker.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Prefer the Authorization header; fall back to the legacy ?key= so a deploy
  // in either order (app first or cron-worker first) keeps working.
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const provided = bearer || (req.nextUrl.searchParams.get('key') ?? '')
  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const base = process.env.SITE_URL ?? 'https://roveloinc.com'
  const admin = createAdminClient()
  const db = admin as unknown as DB

  // 1) Recompute readiness for every active entity (pure compute, no tokens).
  const { data: clients } = await admin.from('clients').select('id, slug, name, org_id, archived_at')
  const active = (clients ?? []).filter((c) => !c.archived_at && c.org_id)
  for (const c of active) await recomputeAndPersist(db, c.id as string)

  // 2) Pull the fresh structured state + the review/proposal counts.
  const [{ data: states }, { data: reviews }, { data: proposals }, { data: mems }, { data: userList }] =
    await Promise.all([
      admin.from('entity_state').select('*'),
      admin.from('field_reviews').select('client_id').eq('status', 'pending'),
      admin.from('detected_signals').select('client_id').eq('status', 'open').like('type', 'propose_%'),
      admin.from('memberships').select('user_id, org_id').eq('role', 'admin'),
      admin.auth.admin.listUsers(),
    ])

  const stateByClient = new Map((states ?? []).map((s) => [s.client_id as string, s as unknown as StateRow]))
  const count = (rows: { client_id: string }[] | null) => {
    const m: Record<string, number> = {}
    for (const r of rows ?? []) m[r.client_id] = (m[r.client_id] ?? 0) + 1
    return m
  }
  const reviewCount = count(reviews as { client_id: string }[] | null)
  const proposalCount = count(proposals as { client_id: string }[] | null)
  const emailById = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? '']))

  const managersByOrg: Record<string, string[]> = {}
  for (const m of mems ?? []) {
    const email = emailById.get(m.user_id as string)
    if (email) (managersByOrg[m.org_id as string] ??= []).push(email)
  }

  // 3) Group attention items by firm and email that firm's managers.
  const itemsByOrg: Record<string, DigestItem[]> = {}
  for (const c of active) {
    const a = deriveAttention({
      client: { id: c.id as string, name: c.name as string, slug: c.slug as string },
      state: stateByClient.get(c.id as string) ?? null,
      pendingReviews: reviewCount[c.id as string] ?? 0,
      openProposals: proposalCount[c.id as string] ?? 0,
    })
    if (!a) continue
    ;(itemsByOrg[c.org_id as string] ??= []).push({
      name: a.name,
      url: `${base}/admin/clients/${a.slug}`,
      reasons: a.reasons,
      level: a.level,
    })
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  let firmsNotified = 0
  let emailsSent = 0
  for (const [orgId, items] of Object.entries(itemsByOrg)) {
    const recipients = managersByOrg[orgId] ?? []
    if (recipients.length === 0) continue
    items.sort((a, b) => rank[a.level] - rank[b.level])
    const html = firmDigestEmailHtml('Your firm', dateLabel, items)
    firmsNotified += 1
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject: `Rovelo brief — ${items.length} need attention`, html })
        emailsSent += 1
      } catch {
        // best-effort; keep going
      }
    }
  }

  return NextResponse.json({ recomputed: active.length, firmsNotified, emailsSent })
}

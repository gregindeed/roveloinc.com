import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const EXPIRED = 'That link is invalid or has expired.'

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

// Branded click-through page. A bare GET (email prefetchers / security scanners)
// lands here and does NOT consume the single-use token — only the button, which
// POSTs back, verifies it. This prevents "invalid or has expired" caused by a
// scanner burning the link before the human clicks.
function interstitial(token_hash: string, type: string, next: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Set up your account — Rovelo Inc</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#fff; color:#111827; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding:24px; }
  .card { width:100%; max-width:360px; text-align:center; }
  .wm { font-family: Georgia, 'Times New Roman', serif; font-weight:700; font-size:22px; letter-spacing:-0.02em; }
  .wm .dot { color:#9ca3af; font-weight:400; }
  h1 { font-size:18px; font-weight:600; margin:22px 0 6px; }
  p { font-size:14px; color:#4b5563; margin:0 0 22px; line-height:1.5; }
  button { width:100%; border:0; border-radius:10px; background:#111827; color:#fff; font-size:14px; font-weight:600;
    padding:12px 16px; cursor:pointer; }
  button:hover { background:#1f2937; }
</style>
</head><body>
  <form class="card" method="POST" action="/auth/confirm">
    <div class="wm">rovelo<span class="dot">.inc</span></div>
    <h1>Set up your account</h1>
    <p>You&#39;ve been invited to Rovelo Inc. Click below to continue and set your password.</p>
    <input type="hidden" name="token_hash" value="${esc(token_hash)}" />
    <input type="hidden" name="type" value="${esc(type)}" />
    <input type="hidden" name="next" value="${esc(next)}" />
    <button type="submit">Continue</button>
  </form>
</body></html>`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/portal'

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(EXPIRED)}`, request.url))
  }
  return new NextResponse(interstitial(token_hash, type, next), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url)
  const form = await request.formData()
  const token_hash = String(form.get('token_hash') || '')
  const type = String(form.get('type') || '') as EmailOtpType
  const next = String(form.get('next') || '/portal')

  if (token_hash && type) {
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    // 303 so the browser follows the redirect as a GET (not a re-POST).
    if (!error) return NextResponse.redirect(`${origin}${next}`, { status: 303 })
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(EXPIRED)}`, { status: 303 })
}

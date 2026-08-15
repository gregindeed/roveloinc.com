import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Security headers applied to every response. For a portal serving financial
// data: force HTTPS, block framing (clickjacking), stop MIME sniffing, and trim
// referrer leakage.
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

function withHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

/**
 * Runs on every request (except static assets).
 * - Sets security headers on all responses.
 * - On /admin/* and /portal/*: refreshes the Supabase session, redirects
 *   unauthenticated users to /login, and restricts /admin/* to work-side roles.
 * (Data access is ALSO enforced in the database by Row-Level Security — this
 * middleware is the first gate, not the only one.)
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const guarded = path.startsWith('/admin') || path.startsWith('/portal')

  if (!guarded) {
    return withHeaders(NextResponse.next({ request }))
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return withHeaders(NextResponse.redirect(url))
  }

  if (path.startsWith('/admin')) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    // Owners, managers (role 'admin') and external collaborators work here.
    // Collaborators are scoped to their granted entities by database RLS.
    if (profile?.role !== 'admin' && profile?.role !== 'collaborator') {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return withHeaders(NextResponse.redirect(url))
    }
  }

  return withHeaders(response)
}

export const config = {
  // Everything except Next internals and static asset files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)'],
}

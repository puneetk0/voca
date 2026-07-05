import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Edge-level gate for /admin routes (proxy is the renamed middleware
// convention in this Next version). Runs before any server component
// renders, so unauthorised users are bounced before they incur DB reads.
export async function proxy(request: NextRequest) {
  // Build a mutable response we can attach refreshed cookies to
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies back to both request and response so the
          // session refresh is visible to subsequent server components
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: Never run any code between createServerClient and getUser()
  // A simple mistake here can cause hard-to-debug random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // --- Admin route gate ---
  if (pathname.startsWith('/admin')) {
    // 1. Must be logged in
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // 2. Must be on the allowlist (if one is configured)
    // Set ALLOWED_ADMIN_EMAILS=email1@x.com,email2@x.com in .env.local
    // In production, if this var is not set, access is denied by default.
    // In development (NODE_ENV !== 'production'), empty list allows any auth user.
    const allowedEmails = (process.env.ALLOWED_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    const isProd = process.env.NODE_ENV === 'production'
    let isAllowed = allowedEmails.length === 0
      ? !isProd  // dev: allow; prod: deny
      : allowedEmails.includes(user.email?.toLowerCase() ?? '')

    // Team members aren't on the env allowlist — fall back to a membership
    // check. Cookie-cached (5 min) so repeat navigations skip the query;
    // allowlisted users never reach this code at all.
    if (!isAllowed) {
      if (request.cookies.get('voca_member')?.value === '1') {
        isAllowed = true
      } else {
        const { data } = await supabase
          .from('form_members')     // RLS: members see only their own rows
          .select('form_id')
          .limit(1)
        if (data && data.length > 0) {
          isAllowed = true
          supabaseResponse.cookies.set('voca_member', '1', {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProd,
            maxAge: 300,
            path: '/admin',
          })
        }
      }
    }

    if (!isAllowed) {
      return NextResponse.redirect(new URL('/?access=denied', request.url))
    }
  }

  return supabaseResponse
}

// Only run on /admin routes — keep middleware off the hot paths
// (form responder, API routes, landing page)
export const config = {
  matcher: ['/admin/:path*'],
}

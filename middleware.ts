import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Edge-level gate for /admin routes.
// This runs before any server component renders, so unauthorised users
// are bounced before they incur any DB reads.
export async function middleware(request: NextRequest) {
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
    // If the var is empty / not set, any authenticated user passes (dev mode).
    const allowedEmails = (process.env.ALLOWED_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)

    if (
      allowedEmails.length > 0 &&
      !allowedEmails.includes(user.email?.toLowerCase() ?? '')
    ) {
      // Redirect to landing page, not login — the user IS logged in, just not invited
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

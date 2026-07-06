import type { Ratelimit } from '@upstash/ratelimit'

// ── In-memory fallback limiter ──────────────────────────────────────────────
// Per-instance fixed-window counter used when Upstash isn't configured (or is
// unreachable). It won't coordinate across serverless instances, but it stops
// the lazy attacker hammering one connection — far better than nothing.
// Upstash remains the real protection in production.
type Window = { count: number; resetAt: number }
const memoryWindows = new Map<string, Window>()
const MAX_TRACKED_KEYS = 10_000

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const w = memoryWindows.get(key)
  if (!w || now >= w.resetAt) {
    // Opportunistic cleanup so the map can't grow unbounded
    if (memoryWindows.size > MAX_TRACKED_KEYS) {
      for (const [k, v] of memoryWindows) {
        if (now >= v.resetAt) memoryWindows.delete(k)
      }
    }
    memoryWindows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  w.count++
  return w.count <= limit
}

export type FallbackLimit = { limit: number; windowMs: number }

/**
 * Best-effort rate limit. Rate limiting is a protective measure, NOT a hard
 * dependency for serving requests:
 *  - Upstash configured → authoritative distributed limit (fails OPEN if the
 *    limiter itself is unreachable).
 *  - Upstash absent → per-instance in-memory fallback when `fallback` given.
 *
 * @returns true if the request may proceed.
 */
export async function checkLimit(
  ratelimit: Ratelimit | null,
  key: string,
  fallback?: FallbackLimit,
): Promise<boolean> {
  if (ratelimit) {
    try {
      const { success } = await ratelimit.limit(key)
      return success
    } catch (err) {
      console.warn('[ratelimit] limiter unreachable, allowing request:', (err as Error)?.message)
      return true
    }
  }
  if (fallback) {
    return memoryLimit(key, fallback.limit, fallback.windowMs)
  }
  return true
}

/**
 * Anti-abuse origin gate for the public AI routes. Its only job is to stop
 * OTHER websites calling our API from a user's browser — so the robust check
 * is "did this request come from a page served on our own host?", NOT "does it
 * exactly equal one hard-coded URL". The old exact-match-vs-NEXT_PUBLIC_APP_URL
 * check broke the whole voice pipeline on any www/apex or *.vercel.app mismatch.
 *
 * Allowed: no Origin (curl → falls to the rate limiter) · same-origin as the
 * request's own host · localhost/127.0.0.1 (any port) · *.vercel.app previews ·
 * the configured NEXT_PUBLIC_APP_URL and its www/apex sibling.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true

  let got: string
  try { got = new URL(origin).host } catch { return true }

  // Same-origin: Origin's host matches the host this request actually arrived on.
  const selfHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (selfHost && got === selfHost) return true

  // Local + LAN dev
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(got)) return true

  // Vercel preview / deployment URLs
  if (got === 'vercel.app' || got.endsWith('.vercel.app')) return true

  // Configured canonical URL, tolerating the www/apex variant
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return true
  try {
    const allowed = new URL(appUrl).host
    const bare = allowed.replace(/^www\./, '')
    if (got === allowed || got === bare || got === 'www.' + bare) return true
  } catch {
    return true
  }
  return false
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
}

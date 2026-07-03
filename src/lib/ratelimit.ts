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
 * Same-origin gate for the public AI routes. Browsers always attach an Origin
 * header to cross-origin POSTs — reject mismatches when we know our own URL.
 * Requests without an Origin (curl and friends) pass through to the rate
 * limiter instead.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return true
  try {
    const allowed = new URL(appUrl).origin
    const got = new URL(origin).origin
    if (got === allowed) return true
    // Local development conveniences
    if (got.startsWith('http://localhost:') || got.startsWith('http://127.0.0.1:')) return true
    return false
  } catch {
    return true
  }
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
}

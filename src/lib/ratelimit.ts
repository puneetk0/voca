import type { Ratelimit } from '@upstash/ratelimit'

/**
 * Best-effort rate limit. Rate limiting is a protective measure, NOT a hard
 * dependency for serving requests — if the limiter is unreachable (stale/deleted
 * Upstash instance, DNS failure, network blip), we FAIL OPEN and allow the
 * request rather than 500-ing every AI call.
 *
 * @returns true if the request may proceed, false only when a reachable limiter
 *          says the caller is over the limit.
 */
export async function checkLimit(ratelimit: Ratelimit | null, key: string): Promise<boolean> {
  if (!ratelimit) return true
  try {
    const { success } = await ratelimit.limit(key)
    return success
  } catch (err) {
    console.warn('[ratelimit] limiter unreachable, allowing request:', (err as Error)?.message)
    return true
  }
}

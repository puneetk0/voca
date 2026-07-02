// Runs once on server startup. Surfaces missing production config early
// (all of these degrade silently otherwise).
export async function register() {
  if (process.env.NODE_ENV !== 'production') return

  const warn = (msg: string) => console.warn(`[voca] ⚠️  ${msg}`)

  const hasLlm =
    process.env.GROQ_KEY || process.env.GROQ_KEY_2 || process.env.GROQ_KEY_3 ||
    process.env.CEREBRAS_API_KEY || process.env.GEMINI_KEY
  if (!hasLlm) warn('No LLM key set (GROQ_KEY / CEREBRAS_API_KEY) — forms cannot run.')
  if (!process.env.SARVAM_API_KEY) warn('SARVAM_API_KEY not set — voice falls back to the browser speech engine.')
  if (!process.env.NEXT_PUBLIC_APP_URL) warn('NEXT_PUBLIC_APP_URL not set — email/share links may point to the wrong domain.')
  if (!process.env.ALLOWED_ADMIN_EMAILS) warn('ALLOWED_ADMIN_EMAILS not set — all admin access is denied in production.')
  if (!process.env.UPSTASH_REDIS_REST_URL) warn('Upstash not configured — API rate limiting is OFF.')
  if (!process.env.RESEND_API_KEY) warn('RESEND_API_KEY not set — new-response emails are disabled.')
}

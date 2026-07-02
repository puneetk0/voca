'use server'

interface ValidationResult {
  groq: boolean
  groqError?: string
  cerebras?: boolean
  cerebrasError?: string
}

async function pingModels(url: string, key: string, label: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: ac.signal })
    clearTimeout(timer)
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, error: `Invalid or expired ${label} API key.` }
    return { ok: false, error: `${label} returned ${res.status}.` }
  } catch (e: any) {
    if (e.name === 'AbortError') return { ok: false, error: `Network timeout — ${label} check took too long.` }
    return { ok: false, error: `${label} error: ${e.message}` }
  }
}

/**
 * Validates the LLM providers (both OpenAI-compatible /models endpoints).
 * Groq is the user-configurable BYOK key; Cerebras is platform-level.
 */
export async function validateAPIKeys(groqKey: string, cerebrasKey?: string): Promise<ValidationResult> {
  const result: ValidationResult = { groq: false }

  if (groqKey) {
    const g = await pingModels('https://api.groq.com/openai/v1/models', groqKey, 'Groq')
    result.groq = g.ok
    if (!g.ok) result.groqError = g.error
  }

  if (cerebrasKey) {
    const c = await pingModels('https://api.cerebras.ai/v1/models', cerebrasKey, 'Cerebras')
    result.cerebras = c.ok
    if (!c.ok) result.cerebrasError = c.error
  }

  return result
}

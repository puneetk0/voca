import Groq from 'groq-sdk'

// Provider chain for structured (JSON) generation:
//   Groq llama-3.3-70b (primary, multi-key)  →  Cerebras gpt-oss-120b (fallback)
//   →  Gemini (only if GEMINI_KEY is set — dormant last resort)
// All three speak an OpenAI-compatible / JSON contract, so callers get the
// same string back regardless of which provider answered.

const groqClients = new Map<string, Groq>()
function getGroqClient(apiKey: string): Groq {
  if (!groqClients.has(apiKey)) groqClients.set(apiKey, new Groq({ apiKey }))
  return groqClients.get(apiKey)!
}

export interface LlmCallOpts {
  /** Per-provider-call timeout. */
  perCallTimeoutMs?: number
  /** Cap on how many Groq keys to try sequentially. Default: all. */
  maxGroqKeys?: number
  /** Gemini retry count on 429/503 (only used if the dormant Gemini path runs). */
  geminiRetries?: number
}

function isTimeoutErr(err: any) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.isTimeout
}
function isRateLimitErr(err: any) {
  return err?.status === 429 || err?.message?.includes('rate_limit') || err?.message?.includes('429')
}

async function callGroq(apiKey: string, system: string, user: string, timeoutMs?: number): Promise<string> {
  const groq = getGroqClient(apiKey)
  const completion = await groq.chat.completions.create(
    {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system + '\nRespond ONLY with valid JSON.' },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      // 600 was truncating long (esp. Hindi/Devanagari) turns mid-JSON —
      // the caller then had to salvage a malformed reply.
      max_tokens: 1000,
    },
    { maxRetries: 0, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) },
  )
  return completion.choices[0]?.message?.content ?? '{}'
}

// Cerebras is OpenAI-compatible — plain fetch, no SDK needed.
async function callCerebras(apiKey: string, system: string, user: string, timeoutMs?: number): Promise<string> {
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-oss-120b',
      messages: [
        { role: 'system', content: system + '\nRespond ONLY with valid JSON.' },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    }),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`Cerebras ${res.status}: ${body.slice(0, 200)}`), { status: res.status })
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? '{}'
}

// Dormant Gemini fallback — only imported/used if GEMINI_KEY is configured.
async function callGeminiIfConfigured(system: string, user: string, opts?: LlmCallOpts): Promise<string> {
  const key = process.env.GEMINI_KEY
  if (!key) throw new Error('No fallback providers available')
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash' })
  const retries = opts?.geminiRetries ?? 1
  const delays = [1000, 2000, 4000]
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = model.generateContent({
        contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      })
      const result = opts?.perCallTimeoutMs
        ? await Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { isTimeout: true })), opts.perCallTimeoutMs))])
        : await p
      return (result as any).response.text()
    } catch (err: any) {
      const retryable = err?.status === 429 || err?.status === 503 || err?.message?.includes('429') || err?.message?.includes('503')
      if (retryable && attempt < retries) { await new Promise(r => setTimeout(r, delays[attempt])); continue }
      throw err
    }
  }
  throw new Error('Gemini failed after retries')
}

export async function callFastFirst(
  groqKeys: string[],
  cerebrasKey: string | null,
  systemInstruction: string,
  userPrompt: string,
  opts?: LlmCallOpts,
): Promise<string> {
  let validKeys = groqKeys.filter(Boolean)
  if (opts?.maxGroqKeys !== undefined) validKeys = validKeys.slice(0, opts.maxGroqKeys)

  // 1) Groq keys in order. 429 → next key; timeout → same upstream, skip to Cerebras.
  for (let i = 0; i < validKeys.length; i++) {
    try {
      const out = await callGroq(validKeys[i], systemInstruction, userPrompt, opts?.perCallTimeoutMs)
      if (i > 0) console.log(`[LLM] Groq key ${i + 1} succeeded`)
      return out
    } catch (err: any) {
      if (isTimeoutErr(err)) { console.warn(`[LLM] Groq key ${i + 1} timed out, skipping to Cerebras`); break }
      if (isRateLimitErr(err) && i < validKeys.length - 1) { console.warn(`[LLM] Groq key ${i + 1} rate-limited, trying next`); continue }
      console.warn(`[LLM] Groq key ${i + 1} failed (${err?.status ?? err?.message}), falling back`)
      break
    }
  }

  // 2) Cerebras fallback.
  if (cerebrasKey) {
    try {
      const out = await callCerebras(cerebrasKey, systemInstruction, userPrompt, opts?.perCallTimeoutMs)
      console.log('[LLM] Cerebras fallback succeeded')
      return out
    } catch (err: any) {
      console.warn(`[LLM] Cerebras failed (${err?.status ?? err?.message}), trying Gemini if configured`)
    }
  }

  // 3) Gemini — dormant unless GEMINI_KEY is set.
  return callGeminiIfConfigured(systemInstruction, userPrompt, opts)
}

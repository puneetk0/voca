import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

const RETRYABLE = [429, 503]
const DELAYS = [1000, 2000, 4000]

// Module-level client caches keyed by API key.
// Reusing instances preserves HTTP connection keep-alive and avoids
// the overhead of building a new connection pool on every request.
const geminiClients = new Map<string, GoogleGenerativeAI>()
const groqClients = new Map<string, Groq>()

function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!geminiClients.has(apiKey)) {
    geminiClients.set(apiKey, new GoogleGenerativeAI(apiKey))
  }
  return geminiClients.get(apiKey)!
}

function getGroqClient(apiKey: string): Groq {
  if (!groqClients.has(apiKey)) {
    groqClients.set(apiKey, new Groq({ apiKey }))
  }
  return groqClients.get(apiKey)!
}

export async function callGeminiWithRetry(
  geminiKey: string,
  groqKey: string | null,
  model: string,
  systemInstruction: string,
  userPrompt: string,
): Promise<string> {
  const genAI = getGeminiClient(geminiKey)
  const geminiModel = genAI.getGenerativeModel({ model, systemInstruction })

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      })
      return result.response.text()
    } catch (err: any) {
      const status = err?.status ?? err?.httpErrorCode ?? 0
      const isRetryable = RETRYABLE.includes(status) || err?.message?.includes('429') || err?.message?.includes('503')

      if (isRetryable && attempt < 2) {
        console.warn(`Gemini attempt ${attempt + 1} failed (${status}), retrying in ${DELAYS[attempt]}ms…`)
        await new Promise(res => setTimeout(res, DELAYS[attempt]))
        continue
      }

      // All Gemini retries exhausted — try Groq fallback
      if (groqKey) {
        console.warn('Gemini failed after retries, falling back to Groq Llama…')
        return callGroqFallback(groqKey, systemInstruction, userPrompt)
      }

      throw err
    }
  }
  throw new Error('Gemini failed after 3 retries')
}

async function callGroqFallback(groqKey: string, systemInstruction: string, userPrompt: string): Promise<string> {
  const groq = getGroqClient(groqKey)
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemInstruction + '\nRespond ONLY with valid JSON.' },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  })
  return completion.choices[0]?.message?.content ?? '{}'
}

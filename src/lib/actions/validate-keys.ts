'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'

interface ValidationResult {
  gemini: boolean
  geminiError?: string
  groq: boolean
  groqError?: string
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await promise
  } catch (e: any) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new Error(`Network timeout — ${label} check took too long. Try again.`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function validateAPIKeys(geminiKey: string, groqKey: string): Promise<ValidationResult> {
  const result: ValidationResult = { gemini: false, groq: false }

  // --- Gemini check ---
  try {
    await withTimeout(
      (async () => {
        const genAI = new GoogleGenerativeAI(geminiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        await model.generateContent('ping')
      })(),
      5000,
      'Gemini',
    )
    result.gemini = true
  } catch (e: any) {
    result.gemini = false
    if (e.message?.includes('timeout')) {
      result.geminiError = e.message
    } else if (e.message?.includes('403') || e.message?.includes('401') || e.message?.includes('API key')) {
      result.geminiError = 'Invalid or unauthorised Gemini API key.'
    } else if (e.message?.includes('429')) {
      // Key is valid but quota is exhausted — still accept it
      result.gemini = true
    } else {
      result.geminiError = `Gemini error: ${e.message}`
    }
  }

  // --- Groq check ---
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqKey}` },
      signal: ac.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      result.groq = true
    } else if (res.status === 401) {
      result.groqError = 'Invalid or expired Groq API key.'
    } else {
      result.groqError = `Groq returned ${res.status}.`
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      result.groqError = 'Network timeout — Groq check took too long. Try again.'
    } else {
      result.groqError = `Groq error: ${e.message}`
    }
  }

  return result
}

'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'

interface ValidationResult {
  gemini: boolean
  geminiError?: string
  groq: boolean
  groqError?: string
  googleTTS?: boolean
  googleTTSError?: string
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

export async function validateAPIKeys(geminiKey: string, groqKey: string, googleTTSKey?: string): Promise<ValidationResult> {
  const result: ValidationResult = { gemini: false, groq: false }

  // --- Gemini check ---
  try {
    await withTimeout(
      (async () => {
        const genAI = new GoogleGenerativeAI(geminiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
        await model.generateContent('ping')
      })(),
      5000,
      'Gemini',
    )
    result.gemini = true
  } catch (e: any) {
    result.gemini = false

    // 🛑 TEMPORARY DEBUG: Print the exact error to your server terminal
    console.log("🔴 RAW GOOGLE ERROR:", e.message);

    if (e.message?.includes('timeout')) {
      result.geminiError = e.message
    } else if (e.message?.includes('429')) {
      result.gemini = true
    } else {
      // 🛑 TEMPORARY DEBUG: Send the exact error to the frontend
      result.geminiError = `Raw Error: ${e.message}`
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

  // --- Google TTS check (Optional) ---
  if (googleTTSKey) {
    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 5000)
      const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${googleTTSKey}`, {
        signal: ac.signal,
      })
      clearTimeout(timer)
      if (res.ok) {
        result.googleTTS = true
      } else if (res.status === 400 || res.status === 403) {
        result.googleTTSError = 'Invalid or unauthorised Google TTS API key.'
      } else {
        result.googleTTSError = `Google TTS returned ${res.status}.`
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        result.googleTTSError = 'Network timeout — Google TTS check took too long.'
      } else {
        result.googleTTSError = `Google TTS error: ${e.message}`
      }
      result.googleTTS = false
    }
  }

  return result
}

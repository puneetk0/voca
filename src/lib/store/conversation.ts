import { create } from 'zustand'
import type { ApiErrorCode } from '@/lib/api-errors'

export type Message = {
  id: string
  role: 'ai' | 'user'
  text: string
}

export type InputMode = 'choice' | 'voice' | 'review' | 'success'

interface ConversationState {
  formId: string | null
  fields: any[]
  currentFieldIndex: number
  history: Message[]
  answers: Record<string, string> // field_id -> value
  sentiments: Record<string, string> // field_id -> sentiment
  audioBlobs: Record<string, Blob> // field_id -> raw audio Blob
  mode: InputMode
  isAiTyping: boolean
  connectionLost: boolean
  // Set when the conversation hits an unrecoverable error (no keys, form
  // closed, etc.) — renders a full-screen blocked state instead of retry UI.
  fatalError: ApiErrorCode | null

  init: (formId: string, fields: any[]) => void
  setFatalError: (code: ApiErrorCode | null) => void
  setMode: (mode: InputMode) => void
  addMessage: (msg: Message) => void
  replaceMessage: (id: string, newMsg: Message) => void
  removeMessage: (id: string) => void
  setAnswer: (fieldId: string, value: string) => void
  setSentiment: (fieldId: string, sentiment: string) => void
  setAudioBlob: (fieldId: string, blob: Blob) => void
  setNextField: (idx: number) => void
  setIsAiTyping: (isTyping: boolean) => void
  setConnectionLost: (lost: boolean) => void
}

export const useConversationStore = create<ConversationState>()((set) => ({
  formId: null,
  fields: [],
  currentFieldIndex: 0,
  history: [],
  answers: {},
  sentiments: {},
  audioBlobs: {},
  mode: 'choice',
  isAiTyping: false,
  connectionLost: false,
  fatalError: null,

  init: (formId, fields) => set({
    formId,
    fields,
    history: [],
    currentFieldIndex: 0,
    mode: 'choice',
    answers: {},
    sentiments: {},
    audioBlobs: {},
    isAiTyping: false,
    connectionLost: false,
    fatalError: null, // must reset — a config error on one form must not leak into the next
  }),
  setFatalError: (code) => set({ fatalError: code }),
  setMode: (mode) => set({ mode }),
  addMessage: (msg) => set((state) => ({ history: [...state.history, msg] })),
  replaceMessage: (id, newMsg) => set((state) => ({
    history: state.history.map(m => m.id === id ? newMsg : m)
  })),
  removeMessage: (id) => set((state) => ({
    history: state.history.filter(m => m.id !== id)
  })),
  setAnswer: (fieldId, value) => set((state) => ({ answers: { ...state.answers, [fieldId]: value } })),
  setSentiment: (fieldId, sentiment) => set((state) => ({ sentiments: { ...state.sentiments, [fieldId]: sentiment } })),
  setAudioBlob: (fieldId, blob) => set((state) => ({ audioBlobs: { ...state.audioBlobs, [fieldId]: blob } })),
  setNextField: (idx) => set({ currentFieldIndex: idx }),
  setIsAiTyping: (isTyping) => set({ isAiTyping: isTyping }),
  setConnectionLost: (lost) => set({ connectionLost: lost }),
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Message = {
  id: string
  role: 'ai' | 'user'
  text: string
}

export type InputMode = 'choice' | 'text' | 'voice' | 'review' | 'success'

interface ConversationState {
  formId: string | null
  fields: any[]
  currentFieldIndex: number
  history: Message[]
  answers: Record<string, string> // field_id -> value
  audioBlobs: Record<string, Blob> // field_id -> raw audio Blob (NOT persisted)
  mode: InputMode
  isAiTyping: boolean
  connectionLost: boolean

  init: (formId: string, fields: any[]) => void
  setMode: (mode: InputMode) => void
  addMessage: (msg: Message) => void
  replaceMessage: (id: string, newMsg: Message) => void
  setAnswer: (fieldId: string, value: string) => void
  setAudioBlob: (fieldId: string, blob: Blob) => void
  setNextField: (idx: number) => void
  setIsAiTyping: (isTyping: boolean) => void
  setConnectionLost: (lost: boolean) => void
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      formId: null,
      fields: [],
      currentFieldIndex: 0,
      history: [],
      answers: {},
      audioBlobs: {},
      mode: 'choice',
      isAiTyping: false,
      connectionLost: false,

      init: (formId, fields) => set((state) => {
        // If same form & already has progress, restore it — don't wipe state
        if (state.formId === formId && state.history.length > 0) {
          return { fields, isAiTyping: false }
        }
        return {
          formId,
          fields,
          history: [],
          currentFieldIndex: 0,
          mode: 'choice',
          answers: {},
          isAiTyping: false,
          connectionLost: false,
        }
      }),
      setMode: (mode) => set({ mode }),
      addMessage: (msg) => set((state) => ({ history: [...state.history, msg] })),
      replaceMessage: (id, newMsg) => set((state) => ({
        history: state.history.map(m => m.id === id ? newMsg : m)
      })),
      setAnswer: (fieldId, value) => set((state) => ({ answers: { ...state.answers, [fieldId]: value } })),
      setAudioBlob: (fieldId, blob) => set((state) => ({ audioBlobs: { ...state.audioBlobs, [fieldId]: blob } })),
      setNextField: (idx) => set({ currentFieldIndex: idx }),
      setIsAiTyping: (isTyping) => set({ isAiTyping: isTyping }),
      setConnectionLost: (lost) => set({ connectionLost: lost }),
    }),
    {
      name: 'voca-conversation',
      // Only persist what's needed for recovery — Blobs can't be serialized
      partialize: (state) => ({
        formId: state.formId,
        fields: state.fields,
        currentFieldIndex: state.currentFieldIndex,
        history: state.history,
        answers: state.answers,
        mode: state.mode === 'success' ? 'success' : state.mode,
      }),
    }
  )
)

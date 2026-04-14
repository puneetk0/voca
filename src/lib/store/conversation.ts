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
  mode: InputMode
  isAiTyping: boolean
  connectionLost: boolean

  init: (formId: string, fields: any[]) => void
  setMode: (mode: InputMode) => void
  addMessage: (msg: Message) => void
  setAnswer: (fieldId: string, value: string) => void
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
      setAnswer: (fieldId, value) => set((state) => ({ answers: { ...state.answers, [fieldId]: value } })),
      setNextField: (idx) => set({ currentFieldIndex: idx }),
      setIsAiTyping: (isTyping) => set({ isAiTyping: isTyping }),
      setConnectionLost: (lost) => set({ connectionLost: lost }),
    }),
    {
      name: 'voca-conversation', // localStorage key
      // Only persist what's needed for recovery — not UI state
      partialize: (state) => ({
        formId: state.formId,
        fields: state.fields,
        currentFieldIndex: state.currentFieldIndex,
        history: state.history,
        answers: state.answers,
        mode: state.mode === 'success' ? 'success' : state.mode, // keep success state
      }),
    }
  )
)

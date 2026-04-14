import { create } from 'zustand'

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
  
  init: (formId: string, fields: any[]) => void
  setMode: (mode: InputMode) => void
  addMessage: (msg: Message) => void
  setAnswer: (fieldId: string, value: string) => void
  setNextField: (idx: number) => void
  setIsAiTyping: (isTyping: boolean) => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  formId: null,
  fields: [],
  currentFieldIndex: 0,
  history: [],
  answers: {},
  mode: 'choice',
  isAiTyping: false,

  init: (formId, fields) => set({ 
    formId, 
    fields, 
    history: [], 
    currentFieldIndex: 0, 
    mode: 'choice', 
    answers: {},
    isAiTyping: false
  }),
  setMode: (mode) => set({ mode }),
  addMessage: (msg) => set((state) => ({ history: [...state.history, msg] })),
  setAnswer: (fieldId, value) => set((state) => ({ answers: { ...state.answers, [fieldId]: value } })),
  setNextField: (idx) => set({ currentFieldIndex: idx }),
  setIsAiTyping: (isTyping) => set({ isAiTyping: isTyping })
}))

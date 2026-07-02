'use client'

import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Loader2, ArrowUp, ArrowDown, AlertTriangle, MessageCircle } from 'lucide-react'

export type BuilderField = { id?: string; label: string; field_type: string; required: boolean; options?: string[] }
export type BuilderSchema = {
  title: string
  description: string
  fields: BuilderField[]
  // AI personality — how the interviewer sounds and what it knows
  ai_tone?: 'professional' | 'friendly' | 'playful'
  ai_context?: string
  welcome_message?: string
  default_language?: 'en' | 'hi'
}

const TONES: { value: 'professional' | 'friendly' | 'playful'; label: string; hint: string }[] = [
  { value: 'professional', label: 'Professional', hint: 'Courteous and precise' },
  { value: 'friendly', label: 'Friendly', hint: 'Warm, like a colleague' },
  { value: 'playful', label: 'Playful', hint: 'Light and witty' },
]

interface Props {
  initialSchema: BuilderSchema
  onSave: (schema: BuilderSchema) => Promise<{ error?: string } | void>
  saveLabel: string
  savingLabel?: string
  /** fieldId -> response count, used to warn on destructive edits (edit mode) */
  responseCounts?: Record<string, number>
}

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'file', label: 'File Upload' },
]

export default function FormBuilder({ initialSchema, onSave, saveLabel, savingLabel = 'Saving...', responseCounts }: Props) {
  const [schema, setSchema] = useState<BuilderSchema>(initialSchema)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const countFor = (f: BuilderField) => (f.id && responseCounts ? responseCounts[f.id] ?? 0 : 0)

  function updateField(idx: number, updates: Partial<BuilderField>) {
    const newFields = [...schema.fields]
    newFields[idx] = { ...newFields[idx], ...updates }
    setSchema({ ...schema, fields: newFields })
  }

  function handleTypeChange(idx: number, newType: string) {
    const field = schema.fields[idx]
    const count = countFor(field)
    if (count > 0 && newType !== field.field_type) {
      if (!window.confirm(`"${field.label}" already has ${count} response${count !== 1 ? 's' : ''}. Changing its type may make that existing data inconsistent. Continue?`)) return
    }
    updateField(idx, {
      field_type: newType,
      options: newType === 'mcq' ? (field.options?.length ? field.options : ['Option A', 'Option B']) : [],
    })
  }

  function addField() {
    setSchema({ ...schema, fields: [...schema.fields, { label: 'New Field', field_type: 'text', required: false, options: [] }] })
  }

  function removeField(idx: number) {
    const field = schema.fields[idx]
    const count = countFor(field)
    if (count > 0) {
      if (!window.confirm(`"${field.label}" has ${count} response${count !== 1 ? 's' : ''}. Removing this field permanently deletes that collected data. Continue?`)) return
    }
    const newFields = [...schema.fields]
    newFields.splice(idx, 1)
    setSchema({ ...schema, fields: newFields })
  }

  function moveField(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= schema.fields.length) return
    const newFields = [...schema.fields]
    ;[newFields[idx], newFields[target]] = [newFields[target], newFields[idx]]
    setSchema({ ...schema, fields: newFields })
  }

  async function handleSave() {
    if (!schema.title.trim()) { setError('Give your form a title.'); return }
    if (schema.fields.length === 0) { setError('Add at least one field.'); return }
    if (schema.fields.some(f => !f.label.trim())) { setError('Every field needs a label.'); return }
    setSaving(true); setError('')
    const res = await onSave(schema)
    if (res && 'error' in res && res.error) {
      setError(res.error)
      setSaving(false)
    }
    // On success the caller navigates away; leave `saving` true to avoid flicker.
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 rounded-3xl p-8">
        <input
          value={schema.title}
          onChange={e => setSchema({ ...schema, title: e.target.value })}
          placeholder="Form title"
          className="w-full bg-transparent text-xl font-semibold border-b border-foreground/10 pb-2 focus:outline-none focus:border-accent-amber transition-colors"
        />
        <input
          value={schema.description}
          onChange={e => setSchema({ ...schema, description: e.target.value })}
          placeholder="Form description"
          className="w-full bg-transparent text-foreground/60 border-b border-transparent hover:border-foreground/10 pb-1 focus:outline-none focus:border-accent-amber transition-colors"
        />

        <div className="pt-6 space-y-3">
          <h3 className="text-sm font-semibold text-foreground bg-foreground/[0.05] inline-block px-3 py-1 rounded-full mb-4">Fields</h3>
          {schema.fields.map((field, i) => {
            const count = countFor(field)
            return (
              <div key={field.id ?? `new-${i}`} className="space-y-2">
                <div className="flex gap-3 items-center bg-background p-4 rounded-xl border border-foreground/5 shadow-sm group">
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} className="text-foreground/25 hover:text-foreground/70 disabled:opacity-20 transition-colors">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveField(i, 1)} disabled={i === schema.fields.length - 1} className="text-foreground/25 hover:text-foreground/70 disabled:opacity-20 transition-colors">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={field.label}
                    onChange={e => updateField(i, { label: e.target.value })}
                    className="flex-1 bg-transparent font-medium focus:outline-none min-w-0"
                    placeholder="Field label"
                  />
                  {count > 0 && (
                    <span className="shrink-0 text-xs text-foreground/35 tabular-nums" title={`${count} responses`}>{count}▪</span>
                  )}
                  <select
                    value={field.field_type}
                    onChange={e => handleTypeChange(i, e.target.value)}
                    className="bg-foreground/[0.03] border-none rounded-lg text-sm px-3 py-1.5 min-w-[120px] focus:ring-0 shrink-0"
                  >
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => updateField(i, { required: e.target.checked })}
                      className="rounded border-foreground/20 text-accent-amber focus:ring-accent-amber bg-transparent"
                    />
                    Required
                  </label>
                  <button
                    onClick={() => removeField(i)}
                    className="p-2 text-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-400/10 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* MCQ Options Editor */}
                {field.field_type === 'mcq' && (
                  <div className="ml-8 flex flex-wrap gap-2 items-center pb-1">
                    {(field.options || []).map((opt, oi) => (
                      <span key={oi} className="flex items-center gap-1 bg-accent-amber/10 border border-accent-amber/20 rounded-full px-3 py-1 text-xs font-medium">
                        <input
                          value={opt}
                          onChange={e => {
                            const newOpts = [...(field.options || [])]
                            newOpts[oi] = e.target.value
                            updateField(i, { options: newOpts })
                          }}
                          className="bg-transparent focus:outline-none w-20"
                        />
                        <button
                          type="button"
                          onClick={() => updateField(i, { options: (field.options || []).filter((_, idx) => idx !== oi) })}
                          className="text-foreground/40 hover:text-red-400 transition-colors"
                        >{'×'}</button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateField(i, { options: [...(field.options || []), `Option ${(field.options?.length ?? 0) + 1}`] })}
                      className="text-xs text-accent-amber hover:opacity-80 transition-opacity"
                    >+ Add option</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={addField}
          className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Field
        </button>
      </div>

      {/* ── Conversation: how the AI interviewer sounds ── */}
      <div className="space-y-6 bg-foreground/[0.02] border border-foreground/10 rounded-3xl p-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-amber/10 text-accent-amber">
            <MessageCircle className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Conversation</h3>
            <p className="text-xs text-foreground/45">Shape how the AI interviewer sounds and what it knows.</p>
          </div>
        </div>

        {/* Tone */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-2.5">Tone</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TONES.map(t => {
              const active = (schema.ai_tone ?? 'friendly') === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSchema({ ...schema, ai_tone: t.value })}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    active
                      ? 'border-accent-amber/50 bg-accent-amber/[0.07] ring-1 ring-accent-amber/30'
                      : 'border-foreground/10 hover:border-foreground/25'
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{t.label}</span>
                  <span className="block text-xs text-foreground/45 mt-0.5">{t.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Context */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-2">Context for the AI</p>
          <textarea
            rows={3}
            maxLength={600}
            value={schema.ai_context ?? ''}
            onChange={e => setSchema({ ...schema, ai_context: e.target.value })}
            placeholder="Who's asking, and why? e.g. We're Acme Events, collecting RSVPs for our Oct 12 launch party in Bangalore. Doors open 6pm, dress code casual."
            className="w-full resize-none rounded-xl bg-background border border-foreground/10 px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent-amber/50 focus:outline-none transition-colors"
          />
          <p className="text-xs text-foreground/35 mt-1.5">The AI uses this to answer respondents&apos; questions and sound informed, not scripted.</p>
        </div>

        {/* Welcome message */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-2">Welcome message</p>
          <input
            value={schema.welcome_message ?? ''}
            maxLength={200}
            onChange={e => setSchema({ ...schema, welcome_message: e.target.value })}
            placeholder="Hi! Thanks for taking a minute to help us plan the launch party."
            className="w-full rounded-xl bg-background border border-foreground/10 px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent-amber/50 focus:outline-none transition-colors"
          />
          <p className="text-xs text-foreground/35 mt-1.5">The first thing the AI says out loud. Leave empty to let it improvise.</p>
        </div>

        {/* Language */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/40 mb-2.5">Conversation language</p>
          <div className="flex gap-2">
            {([['en', 'English'], ['hi', 'हिंदी']] as const).map(([value, label]) => {
              const active = (schema.default_language ?? 'en') === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSchema({ ...schema, default_language: value })}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/[0.09] border border-foreground/10'
                  }`}
                >
                  {label}
                </button>
              )
            })}
            <span className="self-center text-xs text-foreground/35 ml-1">Respondents can switch anytime.</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-center gap-2 text-red-500 text-sm">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-accent-amber px-8 py-3.5 text-sm font-semibold text-black shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  )
}

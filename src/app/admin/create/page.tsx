'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveForm } from '@/lib/actions/forms'
import { Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react'

type Field = { label: string, field_type: string, required: boolean }
type Schema = { title: string, description: string, fields: Field[] }

export default function CreateFormPage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [step, setStep] = useState<'prompt' | 'generating' | 'review' | 'saving'>('prompt')
  const [schema, setSchema] = useState<Schema | null>(null)
  const [error, setError] = useState('')

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) return

    setStep('generating')
    setError('')
    
    try {
      const res = await fetch('/api/create-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'Failed to generate schema')
      
      setSchema(data.schema)
      setStep('review')
    } catch (err: any) {
      console.error(err)
      setError(err.message)
      setStep('prompt')
    }
  }

  function updateField(idx: number, updates: Partial<Field>) {
    if (!schema) return
    const newFields = [...schema.fields]
    newFields[idx] = { ...newFields[idx], ...updates }
    setSchema({ ...schema, fields: newFields })
  }

  function addField() {
    if (!schema) return
    setSchema({ ...schema, fields: [...schema.fields, { label: 'New Field', field_type: 'text', required: false }] })
  }

  function removeField(idx: number) {
    if (!schema) return
    const newFields = [...schema.fields]
    newFields.splice(idx, 1)
    setSchema({ ...schema, fields: newFields })
  }

  async function handleConfirm() {
    if (!schema) return
    setStep('saving')
    setError('')
    try {
      const formId = await saveForm(schema.title, schema.description, schema.fields)
      router.push(`/admin/forms/${formId}`)
    } catch (err: any) {
      setError(err.message)
      setStep('review')
    }
  }

  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      {step === 'prompt' && (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <div>
             <h1 className="text-4xl font-serif font-medium tracking-tight">Create a Natural Form</h1>
             <p className="mt-3 text-lg text-foreground/70 font-light">
               Just describe what you want to collect. Our AI will draft the entire form schema for you.
             </p>
          </div>
          
          <form onSubmit={handleGenerate} className="space-y-4">
            <textarea
              autoFocus
              required
              rows={4}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Ask for their name, age, college preferences, and what kind of tech stack they like."
              className="w-full resize-none rounded-2xl bg-foreground/[0.03] border border-foreground/10 px-6 py-5 text-lg text-foreground shadow-sm placeholder:text-foreground/30 focus:border-accent-sage focus:ring-accent-sage focus:outline-none transition-all"
            />
            
            {error && <div className="text-red-500 text-sm px-2">{error}</div>}
            
            <button
              type="submit"
              className="inline-flex rounded-full bg-accent-sage px-8 py-3 text-sm font-semibold text-black hover:opacity-90 transition-all font-sans"
            >
              Draft Form Schema
            </button>
          </form>
        </div>
      )}

      {step === 'generating' && (
        <div className="py-24 flex flex-col items-center justify-center text-accent-amber animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4" />
          <p className="font-serif text-xl animate-pulse text-foreground">Thinking and designing schema...</p>
        </div>
      )}

      {step === 'saving' && (
        <div className="py-24 flex flex-col items-center justify-center text-accent-sage animate-in fade-in duration-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4" />
          <p className="font-serif text-xl font-medium text-foreground">Saving form securely...</p>
        </div>
      )}

      {step === 'review' && schema && (
        <div className="space-y-10 animate-in slide-in-from-bottom-6 fade-in duration-500">
          <div>
            <h1 className="text-3xl font-serif font-medium mb-2">Review & Adjust</h1>
            <p className="text-foreground/60">Edit the generated fields before publishing.</p>
          </div>

          <div className="space-y-4 bg-foreground/[0.02] border border-foreground/10 rounded-3xl p-8">
            <input 
               value={schema.title}
               onChange={e => setSchema({...schema, title: e.target.value})}
               className="w-full bg-transparent text-2xl font-serif font-medium border-b border-foreground/10 pb-2 focus:outline-none focus:border-accent-amber transition-colors"
            />
            <input 
               value={schema.description}
               onChange={e => setSchema({...schema, description: e.target.value})}
               placeholder="Form description"
               className="w-full bg-transparent text-foreground/60 border-b border-transparent hover:border-foreground/10 pb-1 focus:outline-none focus:border-accent-amber transition-colors"
            />

            <div className="pt-6 space-y-3">
              <h3 className="text-sm font-semibold text-foreground bg-foreground/[0.05] inline-block px-3 py-1 rounded-full mb-4">Fields</h3>
              {schema.fields.map((field, i) => (
                <div key={i} className="flex gap-4 items-center bg-background p-4 rounded-xl border border-foreground/5 shadow-sm group">
                  <input
                    value={field.label}
                    onChange={e => updateField(i, { label: e.target.value })}
                    className="flex-1 bg-transparent font-medium focus:outline-none"
                    placeholder="Field label"
                  />
                  
                  <select 
                    value={field.field_type} 
                    onChange={e => updateField(i, { field_type: e.target.value })}
                    className="bg-foreground/[0.03] border-none rounded-lg text-sm px-3 py-1.5 min-w-[120px] focus:ring-0"
                  >
                    <option value="text">Short Text</option>
                    <option value="textarea">Long Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                  </select>

                  <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
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
                    className="p-2 text-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-400/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button 
              onClick={addField}
              className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 px-4 py-2 rounded-xl transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Field
            </button>
          </div>

          {error && <div className="text-red-500 text-sm px-2 text-center">{error}</div>}

          <div className="flex justify-end pt-4">
             <button
                onClick={handleConfirm}
                className="flex items-center gap-2 rounded-full bg-accent-amber px-8 py-3.5 text-sm font-semibold text-black shadow-sm transition-transform hover:scale-105"
             >
                <CheckCircle2 className="h-4 w-4" />
                Confirm & Publish Form
             </button>
          </div>
        </div>
      )}
    </main>
  )
}

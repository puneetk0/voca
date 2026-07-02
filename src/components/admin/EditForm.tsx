'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import FormBuilder, { type BuilderSchema } from './FormBuilder'
import { updateForm } from '@/lib/actions/forms'

interface Props {
  formId: string
  initialSchema: BuilderSchema
  responseCounts: Record<string, number>
}

export default function EditForm({ formId, initialSchema, responseCounts }: Props) {
  const router = useRouter()
  const hasResponses = Object.values(responseCounts).some(c => c > 0)

  async function handleSave(schema: BuilderSchema) {
    const res = await updateForm(formId, schema.title, schema.description, schema.fields, {
      ai_tone: schema.ai_tone,
      ai_context: schema.ai_context,
      welcome_message: schema.welcome_message,
      default_language: schema.default_language,
    })
    if (res?.error) return { error: res.error }
    router.push(`/admin/forms/${formId}?tab=settings`)
    router.refresh()
  }

  return (
    <main className="max-w-3xl mx-auto py-12 px-6">
      <Link
        href={`/admin/forms/${formId}?tab=settings`}
        className="text-sm font-medium text-foreground/40 hover:text-foreground flex items-center gap-2 mb-8 transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> Back to form
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-2">Edit form</h1>
        <p className="text-foreground/60">Update the title, description, and questions.</p>
        {hasResponses && (
          <p className="mt-3 text-xs text-accent-amber bg-accent-amber/[0.06] border border-accent-amber/15 rounded-xl px-4 py-2.5">
            This form already has responses. Removing a field or changing its type can affect the data you&apos;ve collected — you&apos;ll be asked to confirm.
          </p>
        )}
      </div>

      <FormBuilder
        initialSchema={initialSchema}
        onSave={handleSave}
        saveLabel="Save changes"
        savingLabel="Saving..."
        responseCounts={responseCounts}
      />
    </main>
  )
}

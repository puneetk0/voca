'use client'

import { useState } from 'react'
import { toggleFormStatus, deleteForm } from '@/lib/actions/forms'
import { Trash2, PauseCircle, PlayCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface FormActionsProps {
  formId: string
  isActive: boolean
}

export function FormActions({ formId, isActive }: FormActionsProps) {
  const [isToggling, setIsToggling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    setIsToggling(true)
    await toggleFormStatus(formId, !isActive)
    setIsToggling(false)
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this form? This will instantly delete all submissions and cannot be undone.")) return
    
    setIsDeleting(true)
    await deleteForm(formId)
    // The server action revalidates the admin path, but pushing guarantees navigation
    router.push('/admin')
  }

  return (
    <div className="flex items-center gap-2 mt-4 md:mt-0">
      <button
        onClick={handleToggle}
        disabled={isToggling || isDeleting}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ring-1 ring-inset ${
          isActive 
            ? 'bg-foreground/5 text-foreground/70 ring-foreground/10 hover:bg-foreground/10' 
            : 'bg-accent-sage/10 text-accent-sage ring-accent-sage/20 hover:bg-accent-sage/20'
        } disabled:opacity-50`}
      >
        {isToggling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isActive ? (
          <PauseCircle className="h-4 w-4" />
        ) : (
          <PlayCircle className="h-4 w-4" />
        )}
        {isActive ? 'Pause Form' : 'Activate Form'}
      </button>

      <button
        onClick={handleDelete}
        disabled={isToggling || isDeleting}
        className="flex items-center justify-center rounded-full p-2 text-foreground/40 ring-1 ring-inset ring-foreground/10 hover:bg-red-500/10 hover:text-red-500 hover:ring-red-500/20 transition-all disabled:opacity-50"
        title="Delete Form"
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  )
}

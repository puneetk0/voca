'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportFormCSV } from '@/lib/actions/export'

export function ExportCSVButton({ formId, formTitle, disabled }: { formId: string; formTitle: string; disabled: boolean }) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (disabled || loading) return
    setLoading(true)
    try {
      const csv = await exportFormCSV(formId, formTitle)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safeName = formTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      a.href = url
      a.download = `${safeName}-responses-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error('CSV export failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative group">
      <button
        onClick={handleExport}
        disabled={disabled || loading}
        className="flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4" />
        {loading ? 'Exporting...' : 'Export CSV'}
      </button>
      {disabled && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap bg-foreground text-background text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          No responses yet
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect } from 'react'

// Deployment-skew safety net. When a new version ships while a tab is open,
// client-side navigation can try to fetch JS/RSC chunks from the old build
// that no longer exist → a chunk-load error or a spurious 404. Here we catch
// those specific failures and do a one-time full reload, which pulls the
// current deployment. Guarded by sessionStorage so we never loop.
//
// This is defense-in-depth; the primary fix is Vercel Skew Protection.
const RELOAD_KEY = 'voca_skew_reloaded_at'
const CHUNK_ERR = /Loading chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading CSS chunk|Importing a module script failed/i

export default function ChunkReloadGuard() {
  useEffect(() => {
    function recover() {
      // NEVER auto-reload a respondent who is mid-form: on a flaky mobile
      // connection a single failed chunk would otherwise reload the page and
      // wipe the live conversation. The form fill page (/f/*) is a long-lived
      // single-page experience — a stray chunk error there must not nuke it.
      if (window.location.pathname.startsWith('/f/')) return
      // Only reload once per ~30s to avoid loops on a genuinely broken asset.
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
      if (Date.now() - last < 30_000) return
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
    }
    function onError(e: ErrorEvent) {
      if (CHUNK_ERR.test(e?.message || '')) recover()
    }
    function onRejection(e: PromiseRejectionEvent) {
      const msg = (e?.reason && (e.reason.message || String(e.reason))) || ''
      if (CHUNK_ERR.test(msg)) recover()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}

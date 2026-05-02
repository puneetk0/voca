'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect, useRef } from 'react'

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    // Only capture in production — keeps dev data clean
    loaded: (ph) => {
      if (process.env.NODE_ENV !== 'production') ph.opt_out_capturing()
    },
    capture_pageview: true,
    capture_pageleave: true,
  })
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>
}

// Re-export the hook so components can fire events without importing posthog-js directly
export { usePostHog }

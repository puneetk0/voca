import type { NextConfig } from "next";

// Pragmatic CSP: locks script/connect/media surfaces to what the app actually
// uses (Supabase, PostHog, data-URI audio for TTS) without breaking Next's
// inline runtime. No frame-ancestors here — /f/* must stay embeddable; the
// admin/API surfaces get X-Frame-Options below instead.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.posthog.com https://*.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.i.posthog.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Secure the admin and API surfaces — not applied to /f/* so forms stay embeddable
        source: '/(admin|api)/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'microphone=(self)' },
        ],
      },
    ]
  },
};

export default nextConfig;

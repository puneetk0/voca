import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Voca',
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto py-16 px-6">
      <Link href="/" className="text-sm text-foreground/40 hover:text-foreground/70 transition-colors mb-10 block">← Back</Link>

      <h1 className="text-3xl font-semibold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-foreground/40 mb-10">Last updated: June 2025</p>

      <div className="prose prose-sm max-w-none text-foreground/80 space-y-8">

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">What we collect</h2>
          <ul className="space-y-2 text-sm">
            <li><strong className="text-foreground">Account information</strong> — Email address and password hash when you create an account.</li>
            <li><strong className="text-foreground">Voice recordings</strong> — Audio captured during voice form sessions is uploaded to secure cloud storage to generate transcripts. Recordings are linked to the submitted response.</li>
            <li><strong className="text-foreground">Text responses</strong> — All answers submitted through Voca forms, whether typed or transcribed from voice.</li>
            <li><strong className="text-foreground">API keys</strong> — If you provide your own API keys (Groq, Google Cloud, Gemini), they are stored encrypted in our database and used solely to process your forms. We never share them.</li>
            <li><strong className="text-foreground">Usage data</strong> — Basic server logs (IP addresses, timestamps) for security and debugging.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">How we use your data</h2>
          <ul className="space-y-2 text-sm">
            <li>To provide and improve the Voca service — transcribing voice input, extracting structured answers, and displaying results in your dashboard.</li>
            <li>To send you email notifications when your forms receive new responses.</li>
            <li>To authenticate you and keep your account secure.</li>
            <li>We do not sell, rent, or share your data with third parties for advertising.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Third-party services</h2>
          <p className="text-sm">Voca uses the following sub-processors:</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><strong className="text-foreground">Supabase</strong> — Database, authentication, and file storage.</li>
            <li><strong className="text-foreground">Groq / Google Gemini / Sarvam</strong> — AI processing for transcription and conversation.</li>
            <li><strong className="text-foreground">Resend</strong> — Transactional email delivery.</li>
          </ul>
          <p className="text-sm mt-3">Each service processes data only as necessary to fulfil the service and is governed by their own privacy policies.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Data retention</h2>
          <p className="text-sm">We retain your data for as long as your account is active. Voice recordings and form responses are retained until you delete the form or your account. You can request deletion by emailing us.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Your rights</h2>
          <p className="text-sm">You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us at the address below.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">Contact</h2>
          <p className="text-sm">Questions about this policy? Email us at <a href="mailto:privacy@voca.app" className="text-accent-amber hover:underline">privacy@voca.app</a>.</p>
        </section>
      </div>
    </main>
  )
}

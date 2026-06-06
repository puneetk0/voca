import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — Voca',
}

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto py-16 px-6">
      <Link href="/" className="text-sm text-foreground/40 hover:text-foreground/70 transition-colors mb-10 block">← Back</Link>

      <h1 className="text-3xl font-semibold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm text-foreground/40 mb-10">Last updated: June 2025</p>

      <div className="prose prose-sm max-w-none text-foreground/80 space-y-8">

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">1. Acceptance</h2>
          <p className="text-sm">By creating an account or using Voca (the "Service"), you agree to these Terms. If you do not agree, do not use the Service.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">2. The Service</h2>
          <p className="text-sm">Voca provides an AI-powered voice form platform. We are currently in a pre-launch / waitlist phase. Features and pricing may change before public release. We will notify you of material changes by email.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">3. Your responsibilities</h2>
          <ul className="space-y-2 text-sm">
            <li>You are responsible for obtaining lawful consent from your form respondents before collecting their voice recordings and personal data.</li>
            <li>You must not use Voca for unlawful purposes, to collect data without proper disclosure, or to deceive respondents.</li>
            <li>You are responsible for the security of your account credentials and any API keys you store in your account.</li>
            <li>You must not attempt to reverse-engineer, scrape, or abuse the Service or its APIs.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">4. Content ownership</h2>
          <p className="text-sm">You own all data you collect through Voca forms. By using the Service, you grant Voca a limited licence to process that data solely to provide the Service to you. We do not claim ownership of your forms or responses.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">5. API keys</h2>
          <p className="text-sm">If you provide your own API keys (Groq, Google Cloud, Gemini), you are responsible for managing their quota, costs, and security. Voca is not liable for charges incurred on your API accounts as a result of using the Service.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">6. Availability and warranty</h2>
          <p className="text-sm">The Service is provided "as is" without warranties of any kind. We do not guarantee uninterrupted access. During the pre-launch phase, the Service may be unstable and data may be reset.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">7. Limitation of liability</h2>
          <p className="text-sm">To the maximum extent permitted by law, Voca and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">8. Termination</h2>
          <p className="text-sm">We may suspend or terminate your account if you violate these Terms. You may delete your account at any time by contacting us.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">9. Contact</h2>
          <p className="text-sm">Questions? Email us at <a href="mailto:hello@voca.app" className="text-accent-amber hover:underline">hello@voca.app</a>.</p>
        </section>
      </div>
    </main>
  )
}

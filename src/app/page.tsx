import { LandingNav } from '@/components/landing/LandingNav'
import { Hero } from '@/components/landing/Hero'
import { ProofStrip } from '@/components/landing/ProofStrip'
import { ProblemSection } from '@/components/landing/ProblemSection'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { ComparisonTable } from '@/components/landing/ComparisonTable'
import { StatsBand } from '@/components/landing/StatsBand'
import { FounderNote } from '@/components/landing/FounderNote'
import { UseCases } from '@/components/landing/UseCases'
import { FAQ } from '@/components/landing/FAQ'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { LandingFooter } from '@/components/landing/LandingFooter'

export default function LandingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-background">
      <LandingNav />
      <main>
        <Hero />
        <ProofStrip />
        <ProblemSection />
        <HowItWorks />
        <FeatureGrid />
        <ComparisonTable />
        <StatsBand />
        <FounderNote />
        <UseCases />
        <FAQ />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}

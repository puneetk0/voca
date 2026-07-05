'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, ListChecks, LineChart, Settings2, Users } from 'lucide-react'
import SummaryPanel from './SummaryPanel'
import InsightsPanel from './InsightsPanel'
import ResponsesTable from './ResponsesTable'
import SettingsPanel from './SettingsPanel'
import MembersPanel, { type MemberRow, type InviteRow } from './MembersPanel'
import type { FieldInsight, SessionAnalytics } from './insights'

type Tab = 'summary' | 'results' | 'insights' | 'settings' | 'members'
export type DashboardRole = 'owner' | 'moderator' | 'viewer'

const TABS: { id: Tab; label: string; icon: typeof BarChart3; minRole: DashboardRole }[] = [
  { id: 'summary', label: 'Summary', icon: BarChart3, minRole: 'viewer' },
  { id: 'results', label: 'Results', icon: ListChecks, minRole: 'viewer' },
  { id: 'insights', label: 'Insights', icon: LineChart, minRole: 'viewer' },
  { id: 'settings', label: 'Settings', icon: Settings2, minRole: 'moderator' },
  { id: 'members', label: 'Members', icon: Users, minRole: 'owner' },
]

const RANK: Record<DashboardRole, number> = { viewer: 1, moderator: 2, owner: 3 }

interface Props {
  initialTab: Tab
  summary: {
    totalResponses: number
    voiceCount: number
    textCount: number
    moodLabel: string
    avgFieldsAnswered: number
    totalFields: number
    trendData: { date: string; count: number }[]
  }
  session: SessionAnalytics | null
  fieldInsights: FieldInsight[]
  results: {
    formId: string
    fields: any[]
    initialResponses: any[]
    initialAnswers: any[]
    totalCount: number
    isLimited: boolean
  }
  settings: {
    formId: string
    formTitle: string
    slug: string | null
    isActive: boolean
    redirectUrl: string | null
    emailNotifications: boolean
    appUrl: string
    hasResponses: boolean
  }
  role: DashboardRole
  membersData: { members: MemberRow[]; invites: InviteRow[] } | null
}

export default function DashboardTabs({ initialTab, summary, session, fieldInsights, results, settings, role, membersData }: Props) {
  const router = useRouter()
  // Role-gate the tab list AND the initial tab (a viewer deep-linking
  // ?tab=settings lands on Summary instead).
  const visibleTabs = TABS.filter(t => RANK[role] >= RANK[t.minRole])
  const safeInitial = visibleTabs.some(t => t.id === initialTab) ? initialTab : 'summary'
  const [tab, setTab] = useState<Tab>(safeInitial)

  function selectTab(t: Tab) {
    setTab(t)
    router.replace(`?tab=${t}`, { scroll: false })
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-foreground/10 mb-8 overflow-x-auto">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const activeTab = tab === id
          return (
            <button
              key={id}
              onClick={() => selectTab(id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab ? 'text-foreground' : 'text-foreground/45 hover:text-foreground/70'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {activeTab && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-amber" />}
            </button>
          )
        })}
      </div>

      {/* Panels */}
      {tab === 'summary' && <SummaryPanel {...summary} session={session} />}

      {tab === 'insights' && <InsightsPanel fieldInsights={fieldInsights} session={session} />}

      {tab === 'results' && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/40 mb-4 flex items-center gap-2">
            Individual responses
            <span className="bg-foreground/8 text-xs px-2 py-0.5 rounded-full font-medium normal-case">
              {results.totalCount}{results.isLimited ? '+' : ''}
            </span>
          </h2>
          {results.isLimited && (
            <div className="mb-4 rounded-xl bg-accent-amber/[0.06] border border-accent-amber/15 px-4 py-3 text-xs text-accent-amber">
              Showing the most recent responses — export CSV for the full dataset.
            </div>
          )}
          <ResponsesTable
            formId={results.formId}
            fields={results.fields}
            initialResponses={results.initialResponses}
            initialAnswers={results.initialAnswers}
          />
        </div>
      )}

      {tab === 'settings' && RANK[role] >= RANK.moderator && (
        <SettingsPanel {...settings} canDelete={role === 'owner'} />
      )}

      {tab === 'members' && role === 'owner' && membersData && (
        <MembersPanel formId={results.formId} members={membersData.members} invites={membersData.invites} />
      )}
    </div>
  )
}

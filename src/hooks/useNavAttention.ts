import { useEffect, useState } from 'react'
import { useAgencySession } from '../contexts/AgencyContext'
import { findProjectBottleneck, type BottleneckItem } from '../lib/projectBottleneck'
import { isActionView } from '../lib/projectAttention'
import { supabase } from '../lib/supabase'
import type { ReviewStatus } from '../lib/checklistReview'
import type { NavBadgeKey } from '../components/app-shell/navConfig'
import type { ProjectCardData } from '../components/dashboard/types'

export type NavAttentionCounts = Record<NavBadgeKey, number>

const EMPTY: NavAttentionCounts = {
  actionProjects: 0,
  pendingSignatures: 0,
  draftReminders: 0,
}

type ProjectRow = {
  id: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
  last_reminder_sent_at: string | null
}

type ChecklistRow = {
  project_id: string
  completed: boolean
  label: string
  type: string
  order_index: number
  value: string | null
  review_status: ReviewStatus | null
  submitted_at: string | null
  reviewed_at: string | null
  config: BottleneckItem['config']
}

/**
 * Async attention counters for sidebar badges.
 * Does not block first paint — starts empty, then fills.
 * `actionProjects` mirrors the dashboard « À traiter » view.
 */
export function useNavAttention(): NavAttentionCounts {
  const { agency } = useAgencySession()
  const agencyId = agency?.id ?? null
  const [counts, setCounts] = useState<NavAttentionCounts>(EMPTY)

  useEffect(() => {
    if (!agencyId) return

    let cancelled = false

    const load = async () => {
      const [projectsRes, signaturesRes, remindersRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, status, created_at, last_reminder_sent_at')
          .eq('agency_id', agencyId)
          .neq('status', 'completed'),
        supabase
          .from('checklist_items')
          .select('id, projects!inner(agency_id)', { count: 'exact', head: true })
          .eq('type', 'signature')
          .eq('completed', false)
          .eq('projects.agency_id', agencyId),
        supabase
          .from('smart_reminders')
          .select('id, projects!inner(agency_id)', { count: 'exact', head: true })
          .eq('status', 'draft')
          .eq('projects.agency_id', agencyId),
      ])

      const projectRows = (projectsRes.data ?? []) as ProjectRow[]
      let actionCount = 0

      if (projectRows.length > 0) {
        const projectIds = projectRows.map((row) => row.id)
        const { data: checklistRows } = await supabase
          .from('checklist_items')
          .select(
            'project_id, completed, label, type, order_index, value, review_status, submitted_at, reviewed_at, config',
          )
          .in('project_id', projectIds)
          .order('order_index', { ascending: true })

        const itemsByProject = new Map<string, BottleneckItem[]>()
        for (const row of (checklistRows ?? []) as ChecklistRow[]) {
          const list = itemsByProject.get(row.project_id) ?? []
          list.push({
            label: row.label,
            type: row.type,
            completed: row.completed,
            value: row.value,
            order_index: row.order_index,
            review_status: row.review_status,
            submitted_at: row.submitted_at,
            reviewed_at: row.reviewed_at,
            config: row.config,
          })
          itemsByProject.set(row.project_id, list)
        }

        const now = Date.now()
        for (const row of projectRows) {
          const bottleneck = findProjectBottleneck(
            itemsByProject.get(row.id) ?? [],
            row.created_at,
          )
          const card: ProjectCardData = {
            id: row.id,
            clientId: null,
            clientName: '',
            clientEmail: '',
            clientPhone: null,
            companyName: null,
            status: row.status,
            token: '',
            createdAt: row.created_at,
            lastReminderSentAt: row.last_reminder_sent_at,
            lastReminderSource: null,
            price: null,
            paymentStatus: null,
            completedCount: 0,
            totalCount: 0,
            progress: 0,
            nextStepLabel: null,
            blockingStepLabel: bottleneck?.label ?? null,
            blockingOwner: bottleneck?.owner ?? null,
            blockingSince: bottleneck?.since ?? null,
          }
          if (isActionView(card, now)) actionCount += 1
        }
      }

      if (cancelled) return

      setCounts({
        actionProjects: actionCount,
        pendingSignatures: signaturesRes.error ? 0 : (signaturesRes.count ?? 0),
        draftReminders: remindersRes.error ? 0 : (remindersRes.count ?? 0),
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [agencyId])

  if (!agencyId) return EMPTY
  return counts
}

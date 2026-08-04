import { useCallback, useEffect, useState } from 'react'
import { useAgencySession } from '../../contexts/AgencyContext'
import {
  buildNavAttentionFromDashboard,
  fetchChecklistAttentionRows,
  groupChecklistByProject,
  type ChecklistAttentionRow,
} from '../../lib/agencyAttention'
import { findProjectBottleneck } from '../../lib/projectBottleneck'
import { supabase } from '../../lib/supabase'
import type { ProjectCardData } from './types'

type ProjectRecord = {
  id: string
  client_id: string | null
  client_name: string
  client_email: string
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  created_at: string
  last_reminder_sent_at: string | null
  price: number | null
  payment_status: string | null
  clients?: { company_name: string | null; phone: string | null }[] | { company_name: string | null; phone: string | null } | null
}

type ReminderLogRow = {
  project_id: string
  source: 'auto' | 'manual'
  sent_at: string
}

export function useDashboardData() {
  const { agency, loading: sessionLoading } = useAgencySession()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectCardData[]>([])
  const [autoRemindersThisMonth, setAutoRemindersThisMonth] = useState(0)
  const [pendingExtractionProjects, setPendingExtractionProjects] = useState<Set<string>>(
    () => new Set(),
  )
  const [draftReminderCount, setDraftReminderCount] = useState(0)

  const loadProjects = useCallback(async (agencyId: string) => {
    const { data: projectRows, error: projectsError } = await supabase
      .from('projects')
      .select(
        'id, client_id, client_name, client_email, status, token, created_at, last_reminder_sent_at, price, payment_status, clients(company_name, phone)',
      )
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (projectsError) {
      setProjects([])
      setLoading(false)
      return
    }

    const rawProjects = (projectRows ?? []) as ProjectRecord[]
    if (!rawProjects.length) {
      setProjects([])
      setDraftReminderCount(0)
      setAutoRemindersThisMonth(0)
      setPendingExtractionProjects(new Set())
      buildNavAttentionFromDashboard({
        agencyId,
        projects: [],
        checklistRows: [],
        draftReminderCount: 0,
      })
      setLoading(false)
      return
    }

    const projectIds = rawProjects.map((project) => project.id)
    const checklistRows = await fetchChecklistAttentionRows(projectIds)
    const itemsByProject = groupChecklistByProject(checklistRows)

    const countsByProject = new Map<string, { total: number; completed: number }>()
    for (const row of checklistRows) {
      const current = countsByProject.get(row.project_id) ?? { total: 0, completed: 0 }
      current.total += 1
      if (row.completed) current.completed += 1
      countsByProject.set(row.project_id, current)
    }

    const { data: reminderRows } = await supabase
      .from('project_reminder_logs')
      .select('project_id, source, sent_at')
      .in('project_id', projectIds)
      .order('sent_at', { ascending: false })

    const latestReminderByProject = new Map<string, 'auto' | 'manual'>()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    let autoCount = 0
    for (const row of (reminderRows ?? []) as ReminderLogRow[]) {
      if (!latestReminderByProject.has(row.project_id)) {
        latestReminderByProject.set(row.project_id, row.source)
      }
      if (row.source === 'auto' && new Date(row.sent_at) >= monthStart) {
        autoCount += 1
      }
    }

    const mapped = rawProjects.map((project) => {
      const counts = countsByProject.get(project.id) ?? { total: 0, completed: 0 }
      const progress = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0
      const rawClients = project.clients
      const clientJoin = Array.isArray(rawClients) ? rawClients[0] ?? null : rawClients ?? null
      const bottleneck =
        project.status === 'completed'
          ? null
          : findProjectBottleneck(itemsByProject.get(project.id) ?? [], project.created_at)
      return {
        id: project.id,
        clientId: project.client_id,
        clientName: project.client_name,
        clientEmail: project.client_email,
        clientPhone: clientJoin?.phone ?? null,
        companyName: clientJoin?.company_name ?? null,
        status: project.status,
        token: project.token,
        createdAt: project.created_at,
        lastReminderSentAt: project.last_reminder_sent_at,
        lastReminderSource: latestReminderByProject.get(project.id) ?? null,
        price: project.price ?? null,
        paymentStatus: project.payment_status ?? null,
        completedCount: counts.completed,
        totalCount: counts.total,
        progress,
        nextStepLabel: bottleneck?.label ?? null,
        blockingStepLabel: bottleneck?.label ?? null,
        blockingOwner: bottleneck?.owner ?? null,
        blockingSince: bottleneck?.since ?? null,
      }
    })

    const { data: extractionRows } = await supabase
      .from('extracted_document_data')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('status', 'pending_review')
    setPendingExtractionProjects(
      new Set(((extractionRows ?? []) as { project_id: string }[]).map((r) => r.project_id)),
    )

    const { count: draftCount } = await supabase
      .from('smart_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('status', 'draft')

    const draftReminderCount = draftCount ?? 0
    buildNavAttentionFromDashboard({
      agencyId,
      projects: mapped,
      checklistRows: checklistRows as ChecklistAttentionRow[],
      draftReminderCount,
    })

    setProjects(mapped)
    setAutoRemindersThisMonth(autoCount)
    setDraftReminderCount(draftReminderCount)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (sessionLoading) return
    if (!agency?.id) {
      setProjects([])
      setLoading(false)
      return
    }
    loadProjects(agency.id)
  }, [agency?.id, sessionLoading, loadProjects])

  const removeProject = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
  }, [])

  return {
    loading: sessionLoading || loading,
    projects,
    setProjects,
    removeProject,
    autoRemindersThisMonth,
    pendingExtractionProjects,
    draftReminderCount,
    reload: () => agency?.id && loadProjects(agency.id),
  }
}

import { useCallback, useEffect, useState } from 'react'
import { useAgencySession } from '../../contexts/AgencyContext'
import {
  buildNavAttentionFromDashboard,
  fetchChecklistAttentionRows,
  groupChecklistByProject,
  type ChecklistAttentionRow,
} from '../../lib/agencyAttention'
import { findProjectBottleneck } from '../../lib/projectBottleneck'
import {
  normalizeAgencyProjectStatus,
  type AgencyProjectStatus,
} from '../../lib/status'
import { supabase } from '../../lib/supabase'
import type { ProjectCardData } from './types'

type ProjectRecord = {
  id: string
  client_id: string | null
  name: string | null
  client_name: string
  client_email: string
  status: 'pending' | 'in_progress' | 'completed'
  token: string
  created_at: string
  last_reminder_sent_at: string | null
  last_portal_visit_at: string | null
  reminder_cap_reset_at: string | null
  price: number | null
  payment_status: string | null
  invite_status?: 'pending' | 'sent' | 'failed' | null
  clients?: { company_name: string | null; phone: string | null }[] | { company_name: string | null; phone: string | null } | null
}

type ReminderLogRow = {
  project_id: string
  source: 'auto' | 'manual'
  sent_at: string
  status?: 'sending' | 'sent' | 'failed' | null
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
        'id, client_id, name, client_name, client_email, status, token, created_at, last_reminder_sent_at, last_portal_visit_at, reminder_cap_reset_at, price, payment_status, invite_status, clients(company_name, phone)',
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
    const [checklistRows, derivedRes, reminderRowsRes] = await Promise.all([
      fetchChecklistAttentionRows(projectIds),
      supabase.rpc('project_derived_statuses', { p_project_ids: projectIds }),
      supabase
        .from('project_reminder_logs')
        .select('project_id, source, sent_at, status')
        .in('project_id', projectIds)
        .order('sent_at', { ascending: false }),
    ])
    const itemsByProject = groupChecklistByProject(checklistRows)

    const derivedByProject = new Map<string, AgencyProjectStatus>()
    const unreachableByProject = new Map<string, boolean>()
    for (const row of (derivedRes.data ?? []) as {
      project_id: string
      derived_status: string
      unreachable?: boolean
    }[]) {
      const status = normalizeAgencyProjectStatus(row.derived_status)
      if (status) derivedByProject.set(row.project_id, status)
      unreachableByProject.set(row.project_id, row.unreachable === true)
    }

    const countsByProject = new Map<string, { total: number; completed: number }>()
    for (const row of checklistRows) {
      const current = countsByProject.get(row.project_id) ?? { total: 0, completed: 0 }
      current.total += 1
      if (row.completed) current.completed += 1
      countsByProject.set(row.project_id, current)
    }

    const latestReminderByProject = new Map<string, 'auto' | 'manual'>()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    let autoCount = 0
    for (const row of (reminderRowsRes.data ?? []) as ReminderLogRow[]) {
      if (!latestReminderByProject.has(row.project_id)) {
        latestReminderByProject.set(row.project_id, row.source)
      }
      if (
        row.source === 'auto' &&
        row.status !== 'failed' &&
        new Date(row.sent_at) >= monthStart
      ) {
        autoCount += 1
      }
    }

    const mapped = rawProjects.map((project) => {
      const counts = countsByProject.get(project.id) ?? { total: 0, completed: 0 }
      const progress = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0
      const rawClients = project.clients
      const clientJoin = Array.isArray(rawClients) ? rawClients[0] ?? null : rawClients ?? null
      const checklistItems = itemsByProject.get(project.id) ?? []
      const bottleneck =
        project.status === 'completed'
          ? null
          : findProjectBottleneck(checklistItems, project.created_at)
      const derivedStatus =
        derivedByProject.get(project.id) ??
        (project.status === 'completed' ? 'completed' : 'waiting_client')
      return {
        id: project.id,
        clientId: project.client_id,
        projectName: (project.name?.trim() || project.client_name),
        clientName: project.client_name,
        clientEmail: project.client_email,
        clientPhone: clientJoin?.phone ?? null,
        companyName: clientJoin?.company_name ?? null,
        status: project.status,
        derivedStatus,
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
        inviteStatus: project.invite_status ?? null,
        unreachableClient: unreachableByProject.get(project.id) === true,
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

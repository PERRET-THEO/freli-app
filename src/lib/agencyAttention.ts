import { findProjectBottleneck, type BottleneckItem } from './projectBottleneck'
import { isActionView } from './projectAttention'
import { supabase } from './supabase'
import type { ReviewStatus } from './checklistReview'
import type { ProjectCardData } from '../components/dashboard/types'
import type { NavBadgeKey } from '../components/app-shell/navConfig'

export type NavAttentionCounts = Record<NavBadgeKey, number>

export const EMPTY_NAV_ATTENTION: NavAttentionCounts = {
  actionProjects: 0,
  pendingSignatures: 0,
  draftReminders: 0,
}

export type ChecklistAttentionRow = {
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

export const CHECKLIST_ATTENTION_SELECT =
  'project_id, completed, label, type, order_index, value, review_status, submitted_at, reviewed_at, config'

type ProjectAttentionRow = {
  id: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
  last_reminder_sent_at: string | null
}

type SeedEntry = {
  agencyId: string
  counts: NavAttentionCounts
  at: number
}

const SEED_TTL_MS = 20_000
let seed: SeedEntry | null = null
let inflight: { agencyId: string; promise: Promise<NavAttentionCounts> } | null = null
const seedListeners = new Set<(agencyId: string, counts: NavAttentionCounts) => void>()

export function subscribeNavAttentionSeed(
  listener: (agencyId: string, counts: NavAttentionCounts) => void,
): () => void {
  seedListeners.add(listener)
  return () => {
    seedListeners.delete(listener)
  }
}

export function peekNavAttentionSeed(
  agencyId: string,
  ttlMs = SEED_TTL_MS,
): NavAttentionCounts | null {
  if (!seed || seed.agencyId !== agencyId) return null
  if (Date.now() - seed.at > ttlMs) return null
  return seed.counts
}

export function seedNavAttentionCounts(agencyId: string, counts: NavAttentionCounts): void {
  seed = { agencyId, counts, at: Date.now() }
  for (const listener of seedListeners) listener(agencyId, counts)
}

export function groupChecklistByProject(
  rows: ChecklistAttentionRow[],
): Map<string, BottleneckItem[]> {
  const itemsByProject = new Map<string, BottleneckItem[]>()
  for (const row of rows) {
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
  return itemsByProject
}

export async function fetchChecklistAttentionRows(
  projectIds: string[],
): Promise<ChecklistAttentionRow[]> {
  if (!projectIds.length) return []
  const { data } = await supabase
    .from('checklist_items')
    .select(CHECKLIST_ATTENTION_SELECT)
    .in('project_id', projectIds)
    .order('order_index', { ascending: true })
  return (data ?? []) as ChecklistAttentionRow[]
}

export function countPendingSignatures(rows: ChecklistAttentionRow[]): number {
  return rows.reduce(
    (n, row) => n + (row.type === 'signature' && !row.completed ? 1 : 0),
    0,
  )
}

export function countActionProjectsFromCards(
  projects: ProjectCardData[],
  now = Date.now(),
): number {
  return projects.reduce((n, project) => n + (isActionView(project, now) ? 1 : 0), 0)
}

function toAttentionCard(
  row: ProjectAttentionRow,
  bottleneck: ReturnType<typeof findProjectBottleneck>,
): ProjectCardData {
  return {
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
}

async function fetchNavAttentionCounts(agencyId: string): Promise<NavAttentionCounts> {
  const startedAt = Date.now()
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
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('status', 'draft'),
  ])

  const seededDuringFetch =
    seed?.agencyId === agencyId && seed.at >= startedAt ? seed.counts : null
  if (seededDuringFetch) return seededDuringFetch

  const projectRows = (projectsRes.data ?? []) as ProjectAttentionRow[]
  let actionCount = 0

  if (projectRows.length > 0) {
    const checklistRows = await fetchChecklistAttentionRows(projectRows.map((row) => row.id))
    const seededAfterChecklist =
      seed?.agencyId === agencyId && seed.at >= startedAt ? seed.counts : null
    if (seededAfterChecklist) return seededAfterChecklist

    const itemsByProject = groupChecklistByProject(checklistRows)
    const now = Date.now()
    for (const row of projectRows) {
      const bottleneck = findProjectBottleneck(itemsByProject.get(row.id) ?? [], row.created_at)
      if (isActionView(toAttentionCard(row, bottleneck), now)) actionCount += 1
    }
  }

  return {
    actionProjects: actionCount,
    pendingSignatures: signaturesRes.error ? 0 : (signaturesRes.count ?? 0),
    draftReminders: remindersRes.error ? 0 : (remindersRes.count ?? 0),
  }
}

/** Single-flight + seed-aware loader for sidebar badge counts. */
export function loadNavAttentionCounts(agencyId: string): Promise<NavAttentionCounts> {
  const cached = peekNavAttentionSeed(agencyId)
  if (cached) return Promise.resolve(cached)

  if (inflight?.agencyId === agencyId) return inflight.promise

  const promise = fetchNavAttentionCounts(agencyId)
    .then((counts) => {
      seedNavAttentionCounts(agencyId, counts)
      return counts
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })

  inflight = { agencyId, promise }
  return promise
}

export function buildNavAttentionFromDashboard(args: {
  agencyId: string
  projects: ProjectCardData[]
  checklistRows: ChecklistAttentionRow[]
  draftReminderCount: number
}): NavAttentionCounts {
  const counts: NavAttentionCounts = {
    actionProjects: countActionProjectsFromCards(args.projects),
    pendingSignatures: countPendingSignatures(args.checklistRows),
    draftReminders: args.draftReminderCount,
  }
  seedNavAttentionCounts(args.agencyId, counts)
  return counts
}

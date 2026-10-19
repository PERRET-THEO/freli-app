import type { BottleneckItem } from './projectBottleneck'
import { normalizeAgencyProjectStatus } from './status'
import { supabase } from './supabase'
import type { ReviewStatus } from './checklistReview'
import type { ProjectCardData } from '../components/dashboard/types'
import type { NavBadgeKey } from '../components/app-shell/navConfig'

export type NavAttentionCounts = Record<NavBadgeKey, number>

export const EMPTY_NAV_ATTENTION: NavAttentionCounts = {
  actionProjects: 0,
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

export function countActionProjectsFromCards(projects: ProjectCardData[]): number {
  return projects.reduce(
    (n, project) => n + (project.derivedStatus === 'action_required' ? 1 : 0),
    0,
  )
}

async function fetchNavAttentionCounts(agencyId: string): Promise<NavAttentionCounts> {
  const startedAt = Date.now()
  const projectsRes = await supabase
    .from('projects')
    .select('id')
    .eq('agency_id', agencyId)
    .neq('status', 'completed')

  const seededDuringFetch =
    seed?.agencyId === agencyId && seed.at >= startedAt ? seed.counts : null
  if (seededDuringFetch) return seededDuringFetch

  const projectRows = (projectsRes.data ?? []) as { id: string }[]
  let actionCount = 0

  if (projectRows.length > 0) {
    const { data } = await supabase.rpc('project_derived_statuses', {
      p_project_ids: projectRows.map((row) => row.id),
    })
    const seededAfter = seed?.agencyId === agencyId && seed.at >= startedAt ? seed.counts : null
    if (seededAfter) return seededAfter

    for (const row of (data ?? []) as { derived_status: string }[]) {
      if (normalizeAgencyProjectStatus(row.derived_status) === 'action_required') {
        actionCount += 1
      }
    }
  }

  return { actionProjects: actionCount }
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
  checklistRows?: ChecklistAttentionRow[]
  draftReminderCount?: number
}): NavAttentionCounts {
  const counts: NavAttentionCounts = {
    actionProjects: countActionProjectsFromCards(args.projects),
  }
  seedNavAttentionCounts(args.agencyId, counts)
  return counts
}

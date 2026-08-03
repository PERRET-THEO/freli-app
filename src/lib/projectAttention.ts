import { isBottleneckStale } from './projectBottleneck'
import type { ProjectCardData } from '../components/dashboard/types'

export type AttentionView = 'all' | 'action' | 'waiting' | 'blocked' | 'done'

export const ATTENTION_VIEWS: AttentionView[] = ['action', 'waiting', 'blocked', 'done', 'all']

export const ATTENTION_VIEW_LABELS: Record<AttentionView, string> = {
  action: 'À traiter',
  waiting: 'Chez le client',
  blocked: 'Bloqués',
  done: 'Terminés',
  all: 'Tous',
}

/** Libellés courts pour mobile / overflow. */
export const ATTENTION_VIEW_SHORT_LABELS: Record<AttentionView, string> = {
  action: 'À traiter',
  waiting: 'Client',
  blocked: 'Bloqués',
  done: 'Terminés',
  all: 'Tous',
}

export const DEFAULT_ATTENTION_VIEW: AttentionView = 'action'

const REMINDER_FRESH_MS = 72 * 60 * 60 * 1000
const URGENT_AGE_MS = 48 * 60 * 60 * 1000

/** Aligné sur le chip « À relancer » / urgency narrative du dashboard. */
export function needsAgencyFollowUp(project: ProjectCardData, now: number): boolean {
  if (project.status === 'completed') return false
  const reminderFreshness = project.lastReminderSentAt
    ? now - new Date(project.lastReminderSentAt).getTime()
    : Infinity
  const reminderSentRecently = reminderFreshness < REMINDER_FRESH_MS
  const ageMs = now - new Date(project.createdAt).getTime()
  return ageMs > URGENT_AGE_MS && !reminderSentRecently
}

export function needsAgencyReview(project: ProjectCardData): boolean {
  return project.status !== 'completed' && project.blockingOwner === 'agency'
}

export function isActionView(project: ProjectCardData, now: number): boolean {
  if (project.status === 'completed') return false
  return needsAgencyReview(project) || needsAgencyFollowUp(project, now)
}

export function isWaitingView(project: ProjectCardData, now: number): boolean {
  if (project.status === 'completed') return false
  return !isActionView(project, now)
}

export function isBlockedView(project: ProjectCardData, now: number): boolean {
  if (project.status === 'completed') return false
  if (!project.blockingStepLabel || !project.blockingOwner || !project.blockingSince) {
    return false
  }
  return isBottleneckStale(
    {
      label: project.blockingStepLabel,
      owner: project.blockingOwner,
      since: project.blockingSince,
    },
    now,
  )
}

export function matchesAttentionView(
  project: ProjectCardData,
  view: AttentionView,
  now: number,
): boolean {
  switch (view) {
    case 'all':
      return true
    case 'done':
      return project.status === 'completed'
    case 'action':
      return isActionView(project, now)
    case 'waiting':
      return isWaitingView(project, now)
    case 'blocked':
      return isBlockedView(project, now)
    default:
      return true
  }
}

export function countAttentionViews(
  projects: ProjectCardData[],
  now: number,
): Record<AttentionView, number> {
  const counts: Record<AttentionView, number> = {
    all: projects.length,
    action: 0,
    waiting: 0,
    blocked: 0,
    done: 0,
  }
  for (const project of projects) {
    if (project.status === 'completed') {
      counts.done += 1
      continue
    }
    if (isActionView(project, now)) counts.action += 1
    if (isWaitingView(project, now)) counts.waiting += 1
    if (isBlockedView(project, now)) counts.blocked += 1
  }
  return counts
}

export type DashboardSort = 'newest' | 'stale_first'

export const DASHBOARD_SORT_LABELS: Record<DashboardSort, string> = {
  newest: 'Plus récents',
  stale_first: 'Sans activité d’abord',
}

export const DEFAULT_DASHBOARD_SORT: DashboardSort = 'stale_first'

function activityTimestamp(project: ProjectCardData): number {
  const candidates = [
    project.lastReminderSentAt,
    project.blockingSince,
    project.createdAt,
  ]
    .filter(Boolean)
    .map((iso) => new Date(iso as string).getTime())
  return Math.max(...candidates)
}

export function sortProjects(
  projects: ProjectCardData[],
  sort: DashboardSort,
): ProjectCardData[] {
  const next = [...projects]
  if (sort === 'newest') {
    return next.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }
  return next.sort((a, b) => {
    const aDone = a.status === 'completed'
    const bDone = b.status === 'completed'
    if (aDone !== bDone) return aDone ? 1 : -1
    return activityTimestamp(a) - activityTimestamp(b)
  })
}

export function matchesSearchQuery(project: ProjectCardData, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    project.clientName,
    project.clientEmail,
    project.companyName ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export type FilterEmptyCopy = {
  title: string
  body: string
  primaryAction?: 'create' | 'view_waiting' | 'view_all' | 'clear_search'
}

export function getFilterEmptyCopy(
  view: AttentionView,
  opts: { hasAnyProjects: boolean; hasSearch: boolean },
): FilterEmptyCopy {
  if (!opts.hasAnyProjects) {
    return {
      title: 'Créez votre premier onboarding',
      body: 'En 2 minutes : un lien à envoyer, des relances automatiques, et vous voilà débarrassé de 3h de travail.',
      primaryAction: 'create',
    }
  }
  if (opts.hasSearch) {
    return {
      title: 'Aucun projet ne correspond',
      body: 'Essayez un autre nom de client, ou effacez la recherche.',
      primaryAction: 'clear_search',
    }
  }
  switch (view) {
    case 'action':
      return {
        title: 'Rien à traiter pour le moment',
        body: 'Bonne nouvelle : aucun dossier n’attend une action de votre part. Consultez les projets chez le client, ou tout voir.',
        primaryAction: 'view_waiting',
      }
    case 'waiting':
      return {
        title: 'Aucun projet chez le client',
        body: 'Tous vos dossiers actifs demandent peut‑être votre attention, ou sont déjà terminés.',
        primaryAction: 'view_all',
      }
    case 'blocked':
      return {
        title: 'Aucun projet bloqué',
        body: 'Aucun onboarding n’est bloqué depuis plus de 48 h. Continuez comme ça.',
        primaryAction: 'view_all',
      }
    case 'done':
      return {
        title: 'Aucun projet terminé',
        body: 'Les onboardings complétés apparaîtront ici.',
        primaryAction: 'view_all',
      }
    default:
      return {
        title: 'Aucun projet dans cette vue',
        body: 'Changez de filtre pour voir les autres projets.',
        primaryAction: 'view_all',
      }
  }
}

/** Seuil documenté : au-delà, envisager filtrage serveur / pagination. */
export const CLIENT_FILTER_SERVER_THRESHOLD = 100

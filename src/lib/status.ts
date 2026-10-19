/**
 * Présentation des statuts (libellés + couleurs + filtres).
 *
 * Le statut projet (`AgencyProjectStatus`) est calculé en SQL via
 * `project_derived_status` — ce module ne le recalcule pas.
 *
 * Badges barre latérale :
 * - Vue d'ensemble → count des projets `action_required` uniquement
 * - Contrats / Intégrations → aucun badge (pas de file d'actions sur ces écrans)
 */

import { isRejected, isReviewableType, type ReviewStatus } from './checklistReview'

export type AgencyProjectStatus =
  | 'action_required'
  | 'waiting_client'
  | 'stalled'
  | 'completed'
  | 'draft'

export type ChecklistItemStatus = 'todo' | 'submitted' | 'changes_requested' | 'validated'

/** Filtres attention dashboard + Clients (exclusifs). */
export type AttentionFilter =
  | 'all'
  | 'action_required'
  | 'waiting_client'
  | 'stalled'
  | 'completed'
  | 'draft'
  | 'none'

/** @deprecated Prefer AttentionFilter; kept for URL alias typing. */
export type AttentionView = AttentionFilter

export const ATTENTION_VIEWS: AttentionFilter[] = [
  'action_required',
  'waiting_client',
  'stalled',
  'completed',
  'draft',
  'all',
]

export const ATTENTION_VIEW_LABELS: Record<AttentionFilter, string> = {
  action_required: 'Action requise',
  waiting_client: 'En attente client',
  stalled: 'Bloqués',
  completed: 'Terminés',
  draft: 'Brouillon',
  all: 'Tous',
  none: 'Sans projet',
}

export const ATTENTION_VIEW_SHORT_LABELS: Record<AttentionFilter, string> = {
  action_required: 'Action',
  waiting_client: 'Client',
  stalled: 'Bloqués',
  completed: 'Terminés',
  draft: 'Brouillon',
  all: 'Tous',
  none: 'Sans projet',
}

export const DEFAULT_ATTENTION_VIEW: AttentionFilter = 'action_required'

export const AGENCY_PROJECT_STATUS_LABELS: Record<AgencyProjectStatus, string> = {
  action_required: 'Action requise',
  waiting_client: 'En attente client',
  stalled: 'Bloqué',
  completed: 'Terminé',
  draft: 'Brouillon',
}

export const CHECKLIST_ITEM_LABELS_CLIENT: Record<ChecklistItemStatus, string> = {
  todo: 'À faire',
  submitted: 'Envoyé — en cours de vérification',
  changes_requested: 'À corriger',
  validated: 'Validé ✓',
}

export const CHECKLIST_ITEM_LABELS_AGENCY: Record<ChecklistItemStatus, string> = {
  todo: 'À faire',
  submitted: 'À valider',
  changes_requested: 'Correction demandée',
  validated: 'Validé',
}

/** Tokens CSS / intent couleur. */
export type StatusColorToken = 'action' | 'stalled' | 'waiting' | 'done' | 'info'

export function statusColorToken(
  status: AgencyProjectStatus | ChecklistItemStatus,
): StatusColorToken {
  switch (status) {
    case 'action_required':
    case 'changes_requested':
      return 'action'
    case 'stalled':
      return 'stalled'
    case 'submitted':
      return 'info'
    case 'completed':
    case 'validated':
      return 'done'
    case 'waiting_client':
    case 'draft':
    case 'todo':
    default:
      return 'waiting'
  }
}

export function statusColorClasses(token: StatusColorToken): string {
  switch (token) {
    case 'action':
      return 'bg-[var(--status-action-soft)] text-[var(--status-action)]'
    case 'stalled':
      return 'bg-[var(--status-blocked-soft)] text-[var(--status-blocked)]'
    case 'info':
      return 'bg-[var(--status-info-soft)] text-[var(--status-info)]'
    case 'done':
      return 'bg-[var(--status-done-soft)] text-[var(--status-done)]'
    case 'waiting':
    default:
      return 'bg-[var(--status-waiting-soft)] text-[var(--status-waiting)]'
  }
}

/** Normalise un token SQL ou un alias d'URL legacy. */
export function normalizeAgencyProjectStatus(
  value: string | null | undefined,
): AgencyProjectStatus | null {
  if (!value) return null
  switch (value) {
    case 'action_required':
    case 'action':
      return 'action_required'
    case 'waiting_client':
    case 'waiting':
    case 'in_progress':
      return 'waiting_client'
    case 'stalled':
    case 'blocked':
      return 'stalled'
    case 'completed':
    case 'done':
      return 'completed'
    case 'draft':
      return 'draft'
    default:
      return null
  }
}

export function normalizeAttentionFilter(
  value: string | null | undefined,
): AttentionFilter {
  if (!value || value === 'all') return 'all'
  if (value === 'none') return 'none'
  return normalizeAgencyProjectStatus(value) ?? 'all'
}

export function labelForAgencyProjectStatus(
  status: AgencyProjectStatus | string | null | undefined,
): string {
  const normalized = normalizeAgencyProjectStatus(
    typeof status === 'string' ? status : status ?? null,
  )
  if (!normalized) return 'En attente client'
  return AGENCY_PROJECT_STATUS_LABELS[normalized]
}

export function deriveChecklistItemStatus(item: {
  completed: boolean
  type: string
  review_status: ReviewStatus | null
}): ChecklistItemStatus {
  if (isRejected(item)) return 'changes_requested'
  if (!item.completed) return 'todo'
  if (isReviewableType(item.type)) {
    const review = item.review_status ?? 'pending'
    if (review === 'pending') return 'submitted'
    if (review === 'approved') return 'validated'
  }
  return 'validated'
}

export function labelForChecklistItemStatus(
  status: ChecklistItemStatus,
  role: 'client' | 'agency',
): string {
  return role === 'client'
    ? CHECKLIST_ITEM_LABELS_CLIENT[status]
    : CHECKLIST_ITEM_LABELS_AGENCY[status]
}

export type ProjectWithDerivedStatus = {
  derivedStatus: AgencyProjectStatus
  status?: 'pending' | 'in_progress' | 'completed'
}

export function matchesAttentionFilter(
  project: ProjectWithDerivedStatus,
  filter: AttentionFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'none':
      return false
    default:
      return project.derivedStatus === filter
  }
}

export function countAttentionFilters(
  projects: ProjectWithDerivedStatus[],
): Record<AttentionFilter, number> {
  const counts: Record<AttentionFilter, number> = {
    all: projects.length,
    action_required: 0,
    waiting_client: 0,
    stalled: 0,
    completed: 0,
    draft: 0,
    none: 0,
  }
  for (const project of projects) {
    counts[project.derivedStatus] += 1
  }
  return counts
}

/** Compat : ancien nom countAttentionViews. */
export const countAttentionViews = countAttentionFilters

export type DashboardSort = 'newest' | 'stale_first'

export const DASHBOARD_SORT_LABELS: Record<DashboardSort, string> = {
  newest: 'Plus récents',
  stale_first: 'Sans activité d’abord',
}

export const DEFAULT_DASHBOARD_SORT: DashboardSort = 'stale_first'

export type FilterEmptyCopy = {
  title: string
  body: string
  primaryAction?: 'create' | 'view_waiting' | 'view_all' | 'clear_search'
}

export function getFilterEmptyCopy(
  view: AttentionFilter,
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
    case 'action_required':
      return {
        title: 'Rien à traiter pour le moment',
        body: 'Bonne nouvelle : aucun dossier n’attend une action de votre part. Consultez les projets en attente client, ou tout voir.',
        primaryAction: 'view_waiting',
      }
    case 'waiting_client':
      return {
        title: 'Aucun projet en attente client',
        body: 'Tous vos dossiers actifs demandent peut‑être votre attention, ou sont déjà terminés.',
        primaryAction: 'view_all',
      }
    case 'stalled':
      return {
        title: 'Aucun projet bloqué',
        body: 'Aucun onboarding n’est bloqué au-delà du délai de relance. Continuez comme ça.',
        primaryAction: 'view_all',
      }
    case 'draft':
      return {
        title: 'Aucun brouillon',
        body: 'Les projets dont l’invitation n’est pas encore partie apparaîtront ici quelques minutes.',
        primaryAction: 'view_all',
      }
    case 'completed':
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

export const CLIENT_FILTER_SERVER_THRESHOLD = 100

export function matchesSearchQuery(
  project: {
    projectName: string
    clientName: string
    clientEmail: string
    companyName?: string | null
  },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    project.projectName,
    project.clientName,
    project.clientEmail,
    project.companyName ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function activityTimestamp(project: {
  lastReminderSentAt?: string | null
  blockingSince?: string | null
  createdAt: string
}): number {
  const candidates = [
    project.lastReminderSentAt,
    project.blockingSince,
    project.createdAt,
  ]
    .filter(Boolean)
    .map((iso) => new Date(iso as string).getTime())
  return Math.max(...candidates)
}

export function sortProjects<
  T extends {
    derivedStatus?: AgencyProjectStatus
    status?: string
    createdAt: string
    lastReminderSentAt?: string | null
    blockingSince?: string | null
  },
>(projects: T[], sort: DashboardSort): T[] {
  const next = [...projects]
  if (sort === 'newest') {
    return next.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }
  return next.sort((a, b) => {
    const aDone = a.derivedStatus === 'completed' || a.status === 'completed'
    const bDone = b.derivedStatus === 'completed' || b.status === 'completed'
    if (aDone !== bDone) return aDone ? 1 : -1
    return activityTimestamp(a) - activityTimestamp(b)
  })
}

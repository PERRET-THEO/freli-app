/**
 * @deprecated Prefer `src/lib/status.ts`. Thin re-export for legacy imports.
 */
export {
  ATTENTION_VIEWS,
  ATTENTION_VIEW_LABELS,
  ATTENTION_VIEW_SHORT_LABELS,
  CLIENT_FILTER_SERVER_THRESHOLD,
  DEFAULT_ATTENTION_VIEW,
  DEFAULT_DASHBOARD_SORT,
  DASHBOARD_SORT_LABELS,
  countAttentionFilters as countAttentionViews,
  getFilterEmptyCopy,
  matchesAttentionFilter as matchesAttentionView,
  matchesSearchQuery,
  normalizeAttentionFilter,
  sortProjects,
  type AttentionFilter as AttentionView,
  type DashboardSort,
  type FilterEmptyCopy,
} from './status'

import type { AgencyProjectStatus } from './status'
import type { ProjectCardData } from '../components/dashboard/types'

/** Compat : lit `derivedStatus` (source SQL), plus de dérivation bottleneck. */
export function isActionView(project: ProjectCardData, _now?: number): boolean {
  return project.derivedStatus === 'action_required'
}

export function isWaitingView(project: ProjectCardData, _now?: number): boolean {
  return project.derivedStatus === 'waiting_client'
}

export function isBlockedView(project: ProjectCardData, _now?: number): boolean {
  return project.derivedStatus === 'stalled'
}

export function needsAgencyReview(project: ProjectCardData): boolean {
  return project.derivedStatus === 'action_required'
}

export function needsAgencyFollowUp(project: ProjectCardData, _now?: number): boolean {
  return project.derivedStatus === 'stalled'
}

export type { AgencyProjectStatus }

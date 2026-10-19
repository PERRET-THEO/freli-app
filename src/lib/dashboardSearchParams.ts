import { createParser, parseAsString, parseAsStringEnum } from 'nuqs'
import {
  ATTENTION_VIEWS,
  DEFAULT_ATTENTION_VIEW,
  DEFAULT_DASHBOARD_SORT,
  normalizeAttentionFilter,
  type AttentionFilter,
  type DashboardSort,
} from './status'

/** Accepte les nouveaux tokens et les aliases legacy (action, waiting, blocked, done). */
export const attentionViewParser = createParser({
  parse: (value) => normalizeAttentionFilter(value),
  serialize: (value: AttentionFilter) => value,
}).withDefault(DEFAULT_ATTENTION_VIEW)

export const dashboardSortParser = parseAsStringEnum<DashboardSort>([
  'newest',
  'stale_first',
]).withDefault(DEFAULT_DASHBOARD_SORT)

export const dashboardQueryParser = parseAsString.withDefault('')

export const dashboardSearchParams = {
  view: attentionViewParser,
  sort: dashboardSortParser,
  q: dashboardQueryParser,
} as const

export { ATTENTION_VIEWS }

import { parseAsString, parseAsStringEnum } from 'nuqs'
import {
  ATTENTION_VIEWS,
  DEFAULT_ATTENTION_VIEW,
  DEFAULT_DASHBOARD_SORT,
  type AttentionView,
  type DashboardSort,
} from './projectAttention'

export const attentionViewParser = parseAsStringEnum<AttentionView>([
  ...ATTENTION_VIEWS,
]).withDefault(DEFAULT_ATTENTION_VIEW)

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

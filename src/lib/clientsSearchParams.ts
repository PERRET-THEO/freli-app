import { parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs'

export const CLIENT_LIST_SORTS = [
  'name',
  'created_at',
  'project_count',
  'last_activity',
  'attention',
] as const

export type ClientListSort = (typeof CLIENT_LIST_SORTS)[number]

export const CLIENT_ATTENTION_FILTERS = [
  'all',
  'action',
  'waiting',
  'blocked',
  'done',
  'none',
] as const

export type ClientAttentionFilter = (typeof CLIENT_ATTENTION_FILTERS)[number]

export const CLIENT_ATTENTION_FILTER_LABELS: Record<ClientAttentionFilter, string> = {
  all: 'Tous',
  action: 'À traiter',
  waiting: 'Chez le client',
  blocked: 'Bloqués',
  done: 'Terminés',
  none: 'Sans projet',
}

export const CLIENT_LIST_PAGE_SIZE = 50
export const CLIENT_LIST_FETCH_LIMIT_PRE_PAGER = 500

export const clientsSearchParams = {
  q: parseAsString.withDefault(''),
  sort: parseAsStringEnum<ClientListSort>([...CLIENT_LIST_SORTS]).withDefault('created_at'),
  dir: parseAsStringEnum<'asc' | 'desc'>(['asc', 'desc']).withDefault('desc'),
  status: parseAsStringEnum<ClientAttentionFilter>([...CLIENT_ATTENTION_FILTERS]).withDefault(
    'all',
  ),
  page: parseAsInteger.withDefault(1),
} as const

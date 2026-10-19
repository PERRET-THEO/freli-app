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
  'action_required',
  'waiting_client',
  'stalled',
  'completed',
  'draft',
  'none',
  // Legacy aliases kept for bookmarks / nuqs parsing via normalize in listClients
  'action',
  'waiting',
  'blocked',
  'done',
] as const

export type ClientAttentionFilter = (typeof CLIENT_ATTENTION_FILTERS)[number]

export const CLIENT_ATTENTION_FILTER_LABELS: Record<string, string> = {
  all: 'Tous',
  action_required: 'Action requise',
  waiting_client: 'En attente client',
  stalled: 'Bloqués',
  completed: 'Terminés',
  draft: 'Brouillon',
  none: 'Sans projet',
  action: 'Action requise',
  waiting: 'En attente client',
  blocked: 'Bloqués',
  done: 'Terminés',
}

/** Filtres affichés dans la toolbar (sans aliases legacy). */
export const CLIENT_ATTENTION_FILTERS_UI = [
  'all',
  'action_required',
  'waiting_client',
  'stalled',
  'completed',
  'draft',
  'none',
] as const

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

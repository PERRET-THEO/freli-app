import {
  CLIENT_LIST_FETCH_LIMIT_PRE_PAGER,
  CLIENT_LIST_PAGE_SIZE,
  type ClientAttentionFilter,
  type ClientListSort,
} from './clientsSearchParams'
import {
  normalizeAgencyProjectStatus,
  statusColorToken,
  type AgencyProjectStatus,
} from './status'
import { supabase } from './supabase'

export type ClientListAttentionStatus =
  | AgencyProjectStatus
  | 'none'
  // legacy
  | 'action'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'in_progress'

export type ClientListRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  industry: string | null
  created_at: string
  project_count: number
  attention_status: ClientListAttentionStatus
  last_activity_at: string
  portal_token: string | null
}

export type ListClientsParams = {
  agencyId: string
  search?: string
  status?: ClientAttentionFilter
  sort?: ClientListSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /** When true, use pageSize; when false (Lot B), fetch up to FETCH_LIMIT. */
  paginated?: boolean
  signal?: AbortSignal
}

export type ListClientsResult = {
  rows: ClientListRow[]
  totalCount: number
}

type RpcRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  industry: string | null
  created_at: string
  project_count: number | string
  attention_status: string
  last_activity_at: string
  portal_token: string | null
  total_count: number | string
}

function mapRow(row: RpcRow): ClientListRow {
  const normalized =
    row.attention_status === 'none'
      ? 'none'
      : normalizeAgencyProjectStatus(row.attention_status) ?? 'none'
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    company_name: row.company_name,
    industry: row.industry,
    created_at: row.created_at,
    project_count: Number(row.project_count) || 0,
    attention_status: normalized,
    last_activity_at: row.last_activity_at || row.created_at,
    portal_token: row.portal_token,
  }
}

export async function listClients(params: ListClientsParams): Promise<ListClientsResult> {
  const page = Math.max(1, params.page ?? 1)
  const paginated = params.paginated ?? true
  const pageSize = paginated
    ? Math.max(1, params.pageSize ?? CLIENT_LIST_PAGE_SIZE)
    : CLIENT_LIST_FETCH_LIMIT_PRE_PAGER
  const offset = paginated ? (page - 1) * pageSize : 0
  const status =
    !params.status || params.status === 'all' ? null : params.status

  const rpc = supabase.rpc('list_clients', {
    p_agency_id: params.agencyId,
    p_search: params.search?.trim() || null,
    p_status: status,
    p_sort: params.sort ?? 'created_at',
    p_dir: params.dir ?? 'desc',
    p_limit: pageSize,
    p_offset: offset,
  })

  // supabase-js does not wire AbortSignal into PostgREST yet; caller still
  // ignores stale responses via request id / cancelled flag.
  void params.signal

  const { data, error } = await rpc
  if (error) throw new Error(error.message)

  const rows = ((data ?? []) as RpcRow[]).map(mapRow)
  const totalCount = rows.length ? Number((data as RpcRow[])[0]?.total_count ?? rows.length) : 0
  return { rows, totalCount }
}

export const ATTENTION_STATUS_LABELS: Record<string, string> = {
  action_required: 'Action requise',
  waiting_client: 'En attente client',
  stalled: 'Bloqué',
  completed: 'Terminé',
  draft: 'Brouillon',
  none: 'Sans projet',
  action: 'Action requise',
  waiting: 'En attente client',
  blocked: 'Bloqué',
  done: 'Terminé',
  in_progress: 'En attente client',
}

export function attentionBadgeVariant(
  status: ClientListAttentionStatus,
): 'action_required' | 'stalled' | 'waiting_client' | 'completed' | 'draft' | 'pending' {
  const normalized =
    status === 'none' ? null : normalizeAgencyProjectStatus(status)
  if (!normalized) return 'pending'
  return normalized
}

export function attentionBadgeClassName(status: ClientListAttentionStatus): string {
  const normalized =
    status === 'none' ? null : normalizeAgencyProjectStatus(status)
  if (!normalized) {
    return 'bg-[var(--status-waiting-soft)] text-[var(--status-waiting)]'
  }
  const token = statusColorToken(normalized)
  switch (token) {
    case 'action':
      return 'bg-[var(--status-action-soft)] text-[var(--status-action)]'
    case 'stalled':
      return 'bg-[var(--status-blocked-soft)] text-[var(--status-blocked)]'
    case 'done':
      return 'bg-[var(--status-done-soft)] text-[var(--status-done)]'
    case 'info':
      return 'bg-[var(--status-info-soft)] text-[var(--status-info)]'
    default:
      return 'bg-[var(--status-waiting-soft)] text-[var(--status-waiting)]'
  }
}

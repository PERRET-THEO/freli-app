import { supabase } from './supabase'
import type { AgencyRole } from './agencyMembership'

export type SessionContext = {
  agencyId: string | null
  agencyName: string | null
  logoUrl: string | null
  role: AgencyRole | null
  billingStatus: string | null
  billingHasRow: boolean
}

type RpcPayload = {
  error?: string
  agency_id?: string | null
  agency_name?: string | null
  logo_url?: string | null
  role?: string | null
  billing_status?: string | null
  billing_has_row?: boolean
}

/**
 * Une RPC : agence + rôle + billing. Remplace le waterfall
 * agency_members → agencies → agency_members → billing_accounts.
 */
export async function fetchSessionContext(): Promise<SessionContext | null> {
  const { data, error } = await supabase.rpc('get_session_context')
  if (error) {
    console.warn('get_session_context:', error.message)
    return null
  }
  const row = data as RpcPayload | null
  if (!row || row.error === 'not_authenticated') return null

  const role =
    row.role === 'owner' || row.role === 'member' ? (row.role as AgencyRole) : null

  return {
    agencyId: typeof row.agency_id === 'string' ? row.agency_id : null,
    agencyName: typeof row.agency_name === 'string' ? row.agency_name : null,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
    role,
    billingStatus: typeof row.billing_status === 'string' ? row.billing_status : null,
    billingHasRow: row.billing_has_row === true,
  }
}

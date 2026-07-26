import { supabase } from './supabase'

export type AgencyRole = 'owner' | 'member'

export type AgencyMemberRow = {
  id: string
  agency_id: string
  user_id: string
  role: AgencyRole
  created_at: string
  email: string | null
}

/** Résout l'agence active : membership d'abord, sinon ownership, sinon null. */
export async function resolveAgencyIdForUser(userId: string): Promise<string | null> {
  const { data: membership } = await supabase
    .from('agency_members')
    .select('agency_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membership?.agency_id) return membership.agency_id

  const { data: owned } = await supabase
    .from('agencies')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  return owned?.id ?? null
}

export async function fetchMyAgencyRole(
  agencyId: string,
  userId: string,
): Promise<AgencyRole | null> {
  const { data } = await supabase
    .from('agency_members')
    .select('role')
    .eq('agency_id', agencyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (data?.role === 'owner' || data?.role === 'member') return data.role

  const { data: owned } = await supabase
    .from('agencies')
    .select('id')
    .eq('id', agencyId)
    .eq('user_id', userId)
    .maybeSingle()

  return owned ? 'owner' : null
}

export async function listAgencyMembers(agencyId: string): Promise<AgencyMemberRow[]> {
  const { data, error } = await supabase
    .from('agency_members')
    .select('id, agency_id, user_id, role, created_at, email')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as AgencyMemberRow[]
}

export async function removeAgencyMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('agency_members').delete().eq('id', memberId)
  if (error) throw new Error(error.message)
}

export async function inviteAgencyMember(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('invite-agency-member', {
    body: { email: email.trim().toLowerCase() },
  })
  if (error) throw new Error(error.message)
  const payload = data as { error?: string } | null
  if (payload?.error) throw new Error(payload.error)
}

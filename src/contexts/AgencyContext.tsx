import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreateAgency } from '../lib/agency'
import { fetchMyAgencyRole, type AgencyRole } from '../lib/agencyMembership'
import { formatDisplayName } from '../lib/formatPersonName'
import { supabase } from '../lib/supabase'

type AgencyInfo = {
  id: string
  name: string | null
  logo_url: string | null
}

type AgencySessionContextValue = {
  loading: boolean
  email: string | null
  userId: string | null
  agency: AgencyInfo | null
  role: AgencyRole | null
  /** Prénom Auth (`user_metadata.first_name`) ; chaîne vide si absent. */
  displayName: string
  setDisplayName: (firstName: string) => void
  isOwner: boolean
}

function readFirstName(meta: Record<string, unknown> | undefined): string {
  if (!meta) return ''
  const direct = meta.first_name
  if (typeof direct === 'string' && direct.trim()) return formatDisplayName(direct)
  const given = meta.given_name
  if (typeof given === 'string' && given.trim()) return formatDisplayName(given)
  const full = meta.full_name
  if (typeof full === 'string' && full.trim()) {
    return formatDisplayName(full.trim().split(/\s+/)[0] ?? '')
  }
  return ''
}

const AgencySessionContext = createContext<AgencySessionContextValue | null>(null)

export function AgencySessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [agency, setAgency] = useState<AgencyInfo | null>(null)
  const [role, setRole] = useState<AgencyRole | null>(null)
  const [displayName, setDisplayNameState] = useState('')

  useEffect(() => {
    const load = async () => {
      // Local session (no Auth API round-trip). JWT validity is enforced by RLS/RPC.
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        navigate('/signin', { replace: true })
        return
      }
      setEmail(user.email ?? null)
      setUserId(user.id)
      setDisplayNameState(readFirstName(user.user_metadata as Record<string, unknown>))

      const resolved = await getOrCreateAgency(user.id)
      if (resolved?.id) {
        const { data: agencyRow } = await supabase
          .from('agencies')
          .select('id, name, logo_url')
          .eq('id', resolved.id)
          .maybeSingle()

        if (agencyRow) {
          setAgency({
            id: agencyRow.id,
            name: agencyRow.name ?? null,
            logo_url: agencyRow.logo_url ?? null,
          })
          setRole(await fetchMyAgencyRole(agencyRow.id, user.id))
        }
      }

      setLoading(false)
    }
    load()
  }, [navigate])

  const setDisplayName = useCallback((firstName: string) => {
    setDisplayNameState(firstName.trim() ? formatDisplayName(firstName) : '')
  }, [])

  const value = useMemo(
    () => ({
      loading,
      email,
      userId,
      agency,
      role,
      displayName,
      setDisplayName,
      isOwner: role === 'owner',
    }),
    [loading, email, userId, agency, role, displayName, setDisplayName],
  )

  return <AgencySessionContext.Provider value={value}>{children}</AgencySessionContext.Provider>
}

export function useAgencySession(): AgencySessionContextValue {
  const ctx = useContext(AgencySessionContext)
  if (!ctx) {
    throw new Error('useAgencySession must be used within AgencySessionProvider')
  }
  return ctx
}

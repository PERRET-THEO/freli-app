import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreateAgency } from '../lib/agency'
import { fetchMyAgencyRole, type AgencyRole } from '../lib/agencyMembership'
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
  displayName: string
  isOwner: boolean
}

const AgencySessionContext = createContext<AgencySessionContextValue | null>(null)

export function AgencySessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [agency, setAgency] = useState<AgencyInfo | null>(null)
  const [role, setRole] = useState<AgencyRole | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        navigate('/signin', { replace: true })
        return
      }
      setEmail(data.user.email ?? null)
      setUserId(data.user.id)

      const resolved = await getOrCreateAgency(data.user.id)
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
          setRole(await fetchMyAgencyRole(agencyRow.id, data.user.id))
        }
      }

      setLoading(false)
    }
    load()
  }, [navigate])

  const displayName = useMemo(() => {
    if (agency?.name?.trim()) {
      return agency.name.trim().split(/\s+/)[0]
    }
    if (!email) return 'Freelance'
    return email.split('@')[0].split(/[._-]/)[0]
  }, [agency?.name, email])

  const value = useMemo(
    () => ({
      loading,
      email,
      userId,
      agency,
      role,
      displayName,
      isOwner: role === 'owner',
    }),
    [loading, email, userId, agency, role, displayName],
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

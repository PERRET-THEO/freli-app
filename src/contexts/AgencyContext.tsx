import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AgencyInfo = {
  id: string
  name: string | null
  logo_url: string | null
}

type AgencySessionContextValue = {
  loading: boolean
  email: string | null
  agency: AgencyInfo | null
  displayName: string
}

const AgencySessionContext = createContext<AgencySessionContextValue | null>(null)

export function AgencySessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [agency, setAgency] = useState<AgencyInfo | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) {
        navigate('/signin', { replace: true })
        return
      }
      setEmail(data.user.email ?? null)

      const { data: agencyRow } = await supabase
        .from('agencies')
        .select('id, name, logo_url')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (agencyRow) {
        setAgency({
          id: agencyRow.id,
          name: agencyRow.name ?? null,
          logo_url: agencyRow.logo_url ?? null,
        })
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
    () => ({ loading, email, agency, displayName }),
    [loading, email, agency, displayName],
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

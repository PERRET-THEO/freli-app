import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreateAgency } from '../lib/agency'
import type { AgencyRole } from '../lib/agencyMembership'
import { formatDisplayName } from '../lib/formatPersonName'
import { fetchSessionContext } from '../lib/sessionContext'
import { supabase } from '../lib/supabase'

type AgencyInfo = {
  id: string
  name: string | null
  logo_url: string | null
}

type BillingBootstrap = {
  status: string | null
  hasRow: boolean
  /** true once session RPC (or fallback) has resolved billing. */
  ready: boolean
}

type AgencySessionContextValue = {
  loading: boolean
  email: string | null
  userId: string | null
  agency: AgencyInfo | null
  role: AgencyRole | null
  billing: BillingBootstrap
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
  const [billing, setBilling] = useState<BillingBootstrap>({
    status: null,
    hasRow: false,
    ready: false,
  })
  const [displayName, setDisplayNameState] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) {
        navigate('/signin', { replace: true })
        return
      }
      setEmail(user.email ?? null)
      setUserId(user.id)
      setDisplayNameState(readFirstName(user.user_metadata as Record<string, unknown>))

      const ctx = await fetchSessionContext()
      if (ctx?.agencyId) {
        setAgency({
          id: ctx.agencyId,
          name: ctx.agencyName,
          logo_url: ctx.logoUrl,
        })
        setRole(ctx.role)
        setBilling({
          status: ctx.billingStatus,
          hasRow: ctx.billingHasRow,
          ready: true,
        })
      } else {
        // Premier compte : créer l'agence puis recharger le contexte.
        const created = await getOrCreateAgency(user.id)
        if (created?.id) {
          const again = await fetchSessionContext()
          if (again?.agencyId) {
            setAgency({
              id: again.agencyId,
              name: again.agencyName,
              logo_url: again.logoUrl,
            })
            setRole(again.role)
            setBilling({
              status: again.billingStatus,
              hasRow: again.billingHasRow,
              ready: true,
            })
          } else {
            setAgency({ id: created.id, name: created.name, logo_url: null })
            setRole('owner')
            setBilling({ status: null, hasRow: false, ready: true })
          }
        } else {
          setBilling({ status: null, hasRow: false, ready: true })
        }
      }

      setLoading(false)
    }
    void load()
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
      billing,
      displayName,
      setDisplayName,
      isOwner: role === 'owner',
    }),
    [loading, email, userId, agency, role, billing, displayName, setDisplayName],
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

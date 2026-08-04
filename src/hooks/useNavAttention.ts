import { useEffect, useState } from 'react'
import { useAgencySession } from '../contexts/AgencyContext'
import {
  EMPTY_NAV_ATTENTION,
  loadNavAttentionCounts,
  peekNavAttentionSeed,
  subscribeNavAttentionSeed,
  type NavAttentionCounts,
} from '../lib/agencyAttention'

export type { NavAttentionCounts }

/**
 * Async attention counters for sidebar badges.
 * Does not block first paint — starts empty, then fills.
 * Reuses dashboard seed when available to avoid a second heavy checklist fetch.
 */
export function useNavAttention(): NavAttentionCounts {
  const { agency } = useAgencySession()
  const agencyId = agency?.id ?? null
  const [counts, setCounts] = useState<NavAttentionCounts>(EMPTY_NAV_ATTENTION)

  useEffect(() => {
    if (!agencyId) {
      setCounts(EMPTY_NAV_ATTENTION)
      return
    }

    let cancelled = false

    const unsub = subscribeNavAttentionSeed((id, next) => {
      if (!cancelled && id === agencyId) setCounts(next)
    })

    const seeded = peekNavAttentionSeed(agencyId)
    if (seeded) {
      setCounts(seeded)
      return () => {
        cancelled = true
        unsub()
      }
    }

    void loadNavAttentionCounts(agencyId).then((next) => {
      if (!cancelled) setCounts(next)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [agencyId])

  if (!agencyId) return EMPTY_NAV_ATTENTION
  return counts
}

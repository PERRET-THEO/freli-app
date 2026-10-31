import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgencySession } from '../../contexts/AgencyContext'
import {
  FRELI_SUBSCRIPTION,
  isBillingAccessGranted,
  type BillingAccountStatus,
} from '../../lib/billing/entitlements'
import { fetchBillingAccount } from '../../lib/billing/saasCheckout'
import { Button, Card } from '../ui'

type RequireBillingAccessProps = {
  agencyId: string | null
  children: React.ReactNode
}

/**
 * Bloque le dashboard si un billing_accounts existe et n'est pas actif.
 * Sans ligne billing (comptes legacy invitation) → accès conservé.
 * Préfère le bootstrap `get_session_context` pour éviter un RTT billing dédié.
 */
export function RequireBillingAccess({ agencyId, children }: RequireBillingAccessProps) {
  const { billing: sessionBilling } = useAgencySession()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(true)
  const [status, setStatus] = useState<string | null>(null)

  const applyBilling = useCallback((billingStatus: string | null, hasRow: boolean) => {
    const ok = isBillingAccessGranted(
      billingStatus as BillingAccountStatus | null,
      hasRow,
    )
    setStatus(billingStatus)
    setAllowed(ok)
    setLoading(false)
  }, [])

  const check = useCallback(async () => {
    if (!agencyId) {
      setAllowed(true)
      setLoading(false)
      return
    }
    if (sessionBilling.ready) {
      applyBilling(sessionBilling.status, sessionBilling.hasRow)
      return
    }
    const billing = await fetchBillingAccount(agencyId)
    if (!billing) {
      setAllowed(true)
      setLoading(false)
      return
    }
    applyBilling(billing.status, billing.hasRow)
  }, [agencyId, applyBilling, sessionBilling.hasRow, sessionBilling.ready, sessionBilling.status])

  useEffect(() => {
    setLoading(true)
    void check()
  }, [check])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Vérification de l’abonnement…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">
            Abonnement requis
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            {status === 'past_due'
              ? 'Votre paiement Freli est en retard. Mettez à jour votre moyen de paiement pour retrouver l’accès.'
              : `L’accès à Freli nécessite un abonnement actif (${FRELI_SUBSCRIPTION.monthlyLabelHt} / mois).`}
          </p>
          <Link to="/tarifs">
            <Button className="mt-6 w-full">Voir les tarifs</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}

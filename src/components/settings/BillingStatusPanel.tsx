import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FRELI_SUBSCRIPTION } from '../../lib/billing/entitlements'
import { fetchBillingAccount } from '../../lib/billing/saasCheckout'

type Props = {
  agencyId: string
}

export function BillingStatusPanel({ agencyId }: Props) {
  const [label, setLabel] = useState('Chargement…')
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const billing = await fetchBillingAccount(agencyId)
      if (cancelled) return
      if (!billing || !billing.hasRow) {
        setLabel('Accès legacy (invitation)')
        setDetail('Aucun abonnement Stripe SaaS rattaché à cette agence.')
        return
      }
      const interval =
        billing.billing_interval === 'year'
          ? FRELI_SUBSCRIPTION.yearlyLabelHt + ' / an'
          : FRELI_SUBSCRIPTION.monthlyLabelHt + ' / mois'
      setLabel(
        billing.status === 'active'
          ? `Actif — ${interval}${billing.ai_addon_active ? ' + IA' : ''}`
          : `${billing.status ?? 'inconnu'} — ${interval}${billing.ai_addon_active ? ' + IA' : ''}`,
      )
      setDetail(
        billing.current_period_end
          ? `Prochaine échéance : ${new Date(billing.current_period_end).toLocaleDateString('fr-FR')}`
          : null,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [agencyId])

  return (
    <div className="space-y-2 text-sm font-body text-[var(--ink-soft)]">
      <p>
        <span className="font-medium text-[var(--ink)]">Abonnement Freli :</span> {label}
      </p>
      {detail ? <p className="text-xs text-[var(--ink-muted)]">{detail}</p> : null}
      <p className="text-xs text-[var(--ink-muted)]">
        Distinct de Stripe Connect (paiements clients) — voir{' '}
        <Link to="/dashboard/integrations" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Intégrations
        </Link>
        .
      </p>
    </div>
  )
}

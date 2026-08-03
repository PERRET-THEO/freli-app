import { useCallback, useEffect, useState } from 'react'
import { BillingIntervalToggle } from '../billing/BillingIntervalToggle'
import { Button, Input } from '../ui'
import {
  FRELI_AI_ADDON,
  FRELI_SUBSCRIPTION,
  type BillingInterval,
} from '../../lib/billing/entitlements'
import {
  createSaasCheckout,
  listSubscriptionLeads,
  resendSubscriptionInvite,
  type SubscriptionLead,
} from '../../lib/billing/saasCheckout'

type Props = {
  onFeedback?: (type: 'success' | 'error', text: string) => void
}

export function AdminSubscriptionPanel({ onFeedback }: Props) {
  const [email, setEmail] = useState('')
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [includeAi, setIncludeAi] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [leads, setLeads] = useState<SubscriptionLead[]>([])
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(true)

  const refresh = useCallback(async () => {
    setListLoading(true)
    const result = await listSubscriptionLeads()
    setListLoading(false)
    if ('error' in result) {
      onFeedback?.('error', result.error)
      return
    }
    setLeads(result.leads)
  }, [onFeedback])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreateLink = async () => {
    setLoading(true)
    setCheckoutUrl(null)
    try {
      const result = await createSaasCheckout({
        interval,
        source: 'admin',
        email: email.trim().toLowerCase(),
        includeAi,
      })
      if ('error' in result) {
        onFeedback?.('error', result.error)
        return
      }
      setCheckoutUrl(result.checkoutUrl)
      onFeedback?.('success', 'Lien de paiement généré.')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!checkoutUrl) return
    try {
      await navigator.clipboard.writeText(checkoutUrl)
      onFeedback?.('success', 'Lien copié.')
    } catch {
      onFeedback?.('error', 'Impossible de copier le lien.')
    }
  }

  const handleResend = async (lead: SubscriptionLead) => {
    const result = await resendSubscriptionInvite({ leadId: lead.id })
    if ('error' in result) {
      onFeedback?.('error', result.error)
      return
    }
    onFeedback?.('success', `Invitation renvoyée à ${lead.email}`)
    await refresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-body text-[var(--ink-muted)]">
          Après une visio : génère un lien Checkout ({FRELI_SUBSCRIPTION.monthlyLabelHt} / mois ou{' '}
          {FRELI_SUBSCRIPTION.yearlyLabelHt} / an). Après paiement, un email d’invitation est envoyé
          automatiquement.
        </p>
        <Input
          type="email"
          placeholder="email@prospect.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <BillingIntervalToggle
          value={interval}
          onChange={setInterval}
          yearLabel="Annuel"
          layoutId="admin-billing-interval"
          size="sm"
          variant="light"
        />
        <label className="flex cursor-pointer items-start gap-2 text-sm font-body text-[var(--ink-soft)]">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(e) => setIncludeAi(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
          />
          <span>
            Inclure l’add-on IA (
            {interval === 'month'
              ? FRELI_AI_ADDON.monthlyLabelHt
              : FRELI_AI_ADDON.yearlyLabelHt}
            )
          </span>
        </label>
        <Button type="button" disabled={loading || !email.includes('@')} onClick={() => void handleCreateLink()}>
          {loading ? 'Génération…' : 'Générer le lien de paiement'}
        </Button>
        {checkoutUrl ? (
          <div className="space-y-2 rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
            <p className="break-all text-xs font-body text-[var(--ink-soft)]">{checkoutUrl}</p>
            <Button type="button" onClick={() => void handleCopy()}>
              Copier le lien
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="font-display text-sm font-bold text-[var(--ink)]">Derniers leads</h4>
          <button
            type="button"
            className="text-xs font-body text-[var(--accent)]"
            onClick={() => void refresh()}
          >
            Actualiser
          </button>
        </div>
        {listLoading ? (
          <p className="text-sm font-body text-[var(--ink-muted)]">Chargement…</p>
        ) : leads.length === 0 ? (
          <p className="text-sm font-body text-[var(--ink-muted)]">Aucun lead pour le moment.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-body text-[var(--ink)]">{lead.email}</p>
                  <p className="text-xs font-body text-[var(--ink-muted)]">
                    {lead.source} · {lead.billing_interval} · {lead.status}
                  </p>
                </div>
                {lead.status !== 'account_linked' && !lead.email.endsWith('@freli.local') ? (
                  <button
                    type="button"
                    className="text-xs font-body font-medium text-[var(--accent)]"
                    onClick={() => void handleResend(lead)}
                  >
                    Renvoyer l’invitation
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

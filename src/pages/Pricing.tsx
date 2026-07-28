import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Navbar } from '../components/layout/Navbar'
import { SeoHead } from '../components/seo/SeoHead'
import { Button } from '../components/ui'
import {
  FRELI_AI_ADDON,
  FRELI_PLAN_FEATURES,
  FRELI_SUBSCRIPTION,
  type BillingInterval,
} from '../lib/billing/entitlements'
import { createSaasCheckout } from '../lib/billing/saasCheckout'

export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [includeAi, setIncludeAi] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseCents =
    interval === 'month'
      ? FRELI_SUBSCRIPTION.monthlyAmountCents
      : FRELI_SUBSCRIPTION.yearlyAmountCents
  const aiCents =
    interval === 'month' ? FRELI_AI_ADDON.monthlyAmountCents : FRELI_AI_ADDON.yearlyAmountCents
  const totalCents = baseCents + (includeAi ? aiCents : 0)

  const priceLabel = useMemo(() => {
    const euros = (totalCents / 100).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    return interval === 'month' ? `${euros} € HT / mois` : `${euros} € HT / an`
  }, [interval, totalCents])

  const handleSubscribe = async () => {
    setError(null)
    setLoading(true)
    try {
      const result = await createSaasCheckout({
        interval,
        source: 'pricing',
        includeAi,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      window.location.href = result.checkoutUrl
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <SeoHead
        path="/tarifs"
        title="Tarifs Freli — Abonnement unique"
        description="Abonnement Freli à 59 € HT / mois ou 590 € HT / an. Add-on IA optionnel. TVA calculée au paiement."
      />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">
          Tarifs Freli
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          Un abonnement unique pour freelances et agences. Prix affichés{' '}
          <strong className="text-[var(--white)]">HT</strong> — la TVA est calculée lors du
          paiement selon votre situation.
        </p>

        <div className="mt-8 inline-flex rounded-full border border-[var(--ink-soft)] p-1">
          <button
            type="button"
            onClick={() => setInterval('month')}
            className={`rounded-full px-4 py-1.5 text-sm font-body transition ${
              interval === 'month'
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'text-[var(--surface-warm)] hover:text-[var(--white)]'
            }`}
          >
            Mensuel
          </button>
          <button
            type="button"
            onClick={() => setInterval('year')}
            className={`rounded-full px-4 py-1.5 text-sm font-body transition ${
              interval === 'year'
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'text-[var(--surface-warm)] hover:text-[var(--white)]'
            }`}
          >
            Annuel (−{FRELI_SUBSCRIPTION.yearlyDiscountPercent} %)
          </button>
        </div>

        <article className="mt-6 rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[rgba(91,110,245,0.12)] p-6 sm:p-8">
          <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
            Freelances &amp; agences
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold">
            {FRELI_SUBSCRIPTION.name}
          </h2>
          <p className="mt-4 font-display text-3xl font-bold">{priceLabel}</p>
          <p className="mt-1 text-xs font-body text-[var(--surface-warm)]">
            {interval === 'month' ? (
              <>
                Base {FRELI_SUBSCRIPTION.monthlyLabelHt}
                {includeAi ? ` + IA ${FRELI_AI_ADDON.monthlyLabelHt}` : ''}
              </>
            ) : (
              <>
                Base {FRELI_SUBSCRIPTION.yearlyLabelHt}
                {includeAi ? ` + IA ${FRELI_AI_ADDON.yearlyLabelHt}` : ''} · soit{' '}
                {((totalCents / 100 / 12)).toLocaleString('fr-FR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                € HT / mois
              </>
            )}
          </p>
          <p className="mt-2 text-xs font-body text-[var(--surface-warm)]">
            TVA calculée lors du paiement
          </p>

          <ul className="mt-6 space-y-2 text-sm font-body text-[var(--surface-warm)]">
            {FRELI_PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="text-[var(--mint)]" aria-hidden>
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--ink-soft)] bg-[rgba(0,0,0,0.2)] p-4">
            <input
              type="checkbox"
              checked={includeAi}
              onChange={(e) => setIncludeAi(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[var(--ink-soft)] accent-[var(--accent)]"
            />
            <span>
              <span className="block font-display text-sm font-bold text-[var(--white)]">
                Ajouter les modules IA (+
                {interval === 'month'
                  ? FRELI_AI_ADDON.monthlyLabelHt
                  : FRELI_AI_ADDON.yearlyLabelHt}
                )
              </span>
              <span className="mt-1 block text-xs font-body leading-relaxed text-[var(--surface-warm)]">
                Extraction documents, relances adaptées, brouillon de contrat —{' '}
                {FRELI_AI_ADDON.includedCreditsPerMonth} crédits / mois. Optionnel : un accélérateur,
                pas une obligation.
              </span>
            </span>
          </label>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              className="w-full sm:w-auto"
              disabled={loading}
              onClick={() => void handleSubscribe()}
            >
              {loading ? 'Redirection…' : 'S’abonner'}
            </Button>
            <Link
              to="/demo"
              className="text-center text-sm font-body text-[var(--surface-warm)] underline-offset-2 hover:text-[var(--white)] hover:underline sm:text-left"
            >
              Parler à l’équipe
            </Link>
          </div>
          {error ? (
            <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p>
          ) : null}
        </article>

        <p className="mt-8 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          L’abonnement Freli est distinct des paiements de vos clients : Stripe Connect est inclus
          pour que l’argent arrive sur <strong className="text-[var(--white)]">votre</strong>{' '}
          compte Stripe — Freli ne prélève aucune commission.
        </p>

        <p className="mt-6 text-sm font-body text-[var(--surface-warm)]">
          Vous comparez Freli à un autre outil ? Voir les{' '}
          <Link to="/comparatifs" className="text-[var(--accent)] underline-offset-2 hover:underline">
            comparatifs
          </Link>
          .
        </p>
      </main>
    </div>
  )
}

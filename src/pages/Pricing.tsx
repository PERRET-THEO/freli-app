import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { BillingIntervalToggle } from '../components/billing/BillingIntervalToggle'
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

const EASE = [0.32, 0.72, 0, 1] as const

const priceVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction === 0 ? 0 : 8 * direction,
  }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction === 0 ? 0 : -8 * direction,
  }),
}

const detailVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction === 0 ? 0 : 4 * direction,
  }),
  center: { opacity: 1, y: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction === 0 ? 0 : -4 * direction,
  }),
}

export function Pricing() {
  const reduceMotion = useReducedMotion()
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [includeAi, setIncludeAi] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState(0)

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

  const detailKey = `${interval}-${includeAi ? 'ai' : 'base'}`
  const monthlyEquivalent = ((totalCents / 100 / 12)).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const motionDirection = reduceMotion ? 0 : direction

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: EASE }

  const detailTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: EASE }

  const handleIntervalChange = (next: BillingInterval) => {
    setDirection(next === 'year' ? 1 : -1)
    setInterval(next)
  }

  const handleIncludeAiChange = (checked: boolean) => {
    setDirection(0)
    setIncludeAi(checked)
  }

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

        <BillingIntervalToggle
          className="mt-8"
          value={interval}
          onChange={handleIntervalChange}
          yearLabel={`Annuel (−${FRELI_SUBSCRIPTION.yearlyDiscountPercent} %)`}
          layoutId="pricing-billing-interval"
          variant="dark"
        />

        <article className="mt-6 rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[rgba(91,110,245,0.12)] p-6 sm:p-8">
          <p className="text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
            Freelances &amp; agences
          </p>
          <h2 className="mt-2 font-display text-3xl font-extrabold">
            {FRELI_SUBSCRIPTION.name}
          </h2>

          <div className="relative mt-4 h-[2.25rem] overflow-hidden">
            <AnimatePresence initial={false} custom={motionDirection}>
              <motion.p
                key={priceLabel}
                custom={motionDirection}
                variants={priceVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={transition}
                className="absolute inset-0 font-display text-3xl font-bold"
              >
                {priceLabel}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="relative mt-1 min-h-[2.75rem] overflow-hidden">
            <AnimatePresence initial={false} custom={motionDirection}>
              <motion.p
                key={detailKey}
                custom={motionDirection}
                variants={detailVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={detailTransition}
                className="absolute inset-x-0 top-0 text-xs font-body text-[var(--surface-warm)]"
              >
                {interval === 'month' ? (
                  <>
                    Base {FRELI_SUBSCRIPTION.monthlyLabelHt}
                    {includeAi ? ` + IA ${FRELI_AI_ADDON.monthlyLabelHt}` : ''}
                  </>
                ) : (
                  <>
                    Base {FRELI_SUBSCRIPTION.yearlyLabelHt}
                    {includeAi ? ` + IA ${FRELI_AI_ADDON.yearlyLabelHt}` : ''} · soit{' '}
                    {monthlyEquivalent} € HT / mois
                  </>
                )}
              </motion.p>
            </AnimatePresence>
          </div>

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

          <label
            className={`mt-8 flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-4 transition-colors duration-200 ${
              includeAi
                ? 'border-[var(--accent)] bg-[rgba(91,110,245,0.28)] ring-1 ring-[var(--accent)]/40'
                : 'border-[var(--ink-soft)] bg-[rgba(0,0,0,0.2)]'
            }`}
          >
            <input
              type="checkbox"
              checked={includeAi}
              onChange={(e) => handleIncludeAiChange(e.target.checked)}
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

/**
 * Grille Freli validée — abonnement unique + add-on IA.
 * Prix affichés HT ; TTC calculé au checkout (Stripe Tax).
 * Stripe Connect (paiements clients) est une feature du socle, distincte de cet abo SaaS.
 */

export const FRELI_CURRENCY = 'eur' as const

export const FRELI_SUBSCRIPTION = {
  key: 'freli',
  name: 'Abonnement Freli',
  /** Centimes EUR HT */
  monthlyAmountCents: 5900,
  yearlyAmountCents: 59000,
  monthlyLabelHt: '59 € HT',
  yearlyLabelHt: '590 € HT',
  yearlyEquivalentMonthlyLabelHt: '49,17 € HT',
  yearlyDiscountPercent: 17,
} as const

export const FRELI_AI_ADDON = {
  key: 'freli_ai',
  name: 'Modules IA',
  monthlyAmountCents: 2900,
  yearlyAmountCents: 29000,
  monthlyLabelHt: '29 € HT',
  yearlyLabelHt: '290 € HT',
  includedCreditsPerMonth: 50,
  extraPackCredits: 50,
  extraPackAmountCents: 1500,
  extraPackLabelHt: '15 € HT',
} as const

export const FRELI_PLAN_FEATURES = [
  'Portail client + formulaire + upload + signature native',
  'Autofill SIREN / SIRET',
  'Branding portail (logo, couleur d’accent, tagline, message d’accueil, portfolio)',
  'Paiements clients via Stripe Connect (argent sur votre compte — 0 % Freli)',
  'Relances automatiques',
  'Synchronisation Google Drive',
  'Webhooks natifs (Zapier, Make, n8n, Slack…)',
  'Sièges équipe illimités',
  'Templates, clients et projets illimités',
] as const

export type BillingInterval = 'month' | 'year'

export type BillingAccountStatus = 'active' | 'past_due' | 'canceled' | 'incomplete'

export function isBillingAccessGranted(
  status: BillingAccountStatus | null | undefined,
  hasBillingRow: boolean,
): boolean {
  // Comptes legacy (invitation avant billing) : pas de ligne → accès conservé.
  if (!hasBillingRow) return true
  return status === 'active'
}

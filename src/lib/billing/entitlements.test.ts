import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRELI_AI_ADDON, FRELI_SUBSCRIPTION } from './entitlements'

/**
 * Garde-fou : la grille affichée (entitlements.ts) doit correspondre aux prix que
 * bootstrap-saas-prices crée dans Stripe — sinon la page tarifs et le Checkout divergent.
 */
const bootstrapSource = readFileSync(
  resolve(__dirname, '../../../supabase/functions/bootstrap-saas-prices/index.ts'),
  'utf8',
)

function stripeAmountFor(lookupKey: string): number {
  const re = new RegExp(`lookupKey: '${lookupKey}'[\\s\\S]*?amountCents: (\\d+)`)
  const match = bootstrapSource.match(re)
  if (!match) throw new Error(`lookupKey ${lookupKey} introuvable dans bootstrap-saas-prices`)
  return Number(match[1])
}

function euros(cents: number): string {
  return `${(cents / 100).toLocaleString('fr-FR')} € HT`
}

describe('grille tarifaire Freli', () => {
  it('les montants Stripe correspondent aux montants affichés', () => {
    expect(stripeAmountFor('freli_subscription_month')).toBe(FRELI_SUBSCRIPTION.monthlyAmountCents)
    expect(stripeAmountFor('freli_subscription_year')).toBe(FRELI_SUBSCRIPTION.yearlyAmountCents)
    expect(stripeAmountFor('freli_ai_month')).toBe(FRELI_AI_ADDON.monthlyAmountCents)
    expect(stripeAmountFor('freli_ai_year')).toBe(FRELI_AI_ADDON.yearlyAmountCents)
  })

  it('les libellés correspondent aux montants', () => {
    expect(FRELI_SUBSCRIPTION.monthlyLabelHt).toBe(euros(FRELI_SUBSCRIPTION.monthlyAmountCents))
    expect(FRELI_SUBSCRIPTION.yearlyLabelHt).toBe(euros(FRELI_SUBSCRIPTION.yearlyAmountCents))
    expect(FRELI_AI_ADDON.monthlyLabelHt).toBe(euros(FRELI_AI_ADDON.monthlyAmountCents))
    expect(FRELI_AI_ADDON.yearlyLabelHt).toBe(euros(FRELI_AI_ADDON.yearlyAmountCents))
  })

  it("l'annuel vaut 10 mois (2 mois offerts)", () => {
    const paidMonths = 12 - FRELI_SUBSCRIPTION.yearlyFreeMonths
    expect(FRELI_SUBSCRIPTION.yearlyAmountCents).toBe(FRELI_SUBSCRIPTION.monthlyAmountCents * paidMonths)
    expect(FRELI_AI_ADDON.yearlyAmountCents).toBe(FRELI_AI_ADDON.monthlyAmountCents * paidMonths)
    const equivalent = (FRELI_SUBSCRIPTION.yearlyAmountCents / 100 / 12).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    expect(FRELI_SUBSCRIPTION.yearlyEquivalentMonthlyLabelHt).toBe(`${equivalent} € HT`)
  })
})

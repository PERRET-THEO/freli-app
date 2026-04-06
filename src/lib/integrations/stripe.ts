/**
 * Config stored on the `integrations` row for provider `stripe`.
 * Checkout amount comes from `projects.price` (EUR), not from here.
 */
export type StripeConfig = {
  currency?: string
  /** Stripe Connect Express account id */
  stripe_connect_account_id?: string
  charges_enabled?: boolean
  details_submitted?: boolean
}

export const DEFAULT_STRIPE_CONFIG: StripeConfig = {
  currency: 'eur',
}

export function parseStripeConfig(raw: Record<string, unknown> | null | undefined): StripeConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STRIPE_CONFIG }
  const o = raw as Record<string, unknown>
  return {
    currency: typeof o.currency === 'string' ? o.currency : DEFAULT_STRIPE_CONFIG.currency,
    stripe_connect_account_id:
      typeof o.stripe_connect_account_id === 'string' ? o.stripe_connect_account_id : undefined,
    charges_enabled: typeof o.charges_enabled === 'boolean' ? o.charges_enabled : undefined,
    details_submitted: typeof o.details_submitted === 'boolean' ? o.details_submitted : undefined,
  }
}

export function isStripeReadyForCheckout(config: StripeConfig): boolean {
  return Boolean(
    config.stripe_connect_account_id?.startsWith('acct_') && config.charges_enabled === true,
  )
}

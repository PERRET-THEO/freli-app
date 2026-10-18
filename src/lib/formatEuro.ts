const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Unique euro formatter for UI, emails, activity, Stripe copy. */
export function formatEuro(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(Number(price))) return '—'
  const n = Number(price)
  if (n < 0) return '—'
  return EUR_FORMATTER.format(n)
}

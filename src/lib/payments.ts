export type PaymentState = 'none' | 'pending' | 'paid'

/** Détermine l'état de paiement d'un projet à partir du prix et du statut. */
export function getPaymentState(
  price: number | null | undefined,
  paymentStatus: string | null | undefined,
): PaymentState {
  if (!price || price <= 0) return 'none'
  if (paymentStatus === 'paid') return 'paid'
  return 'pending'
}

/** Formate un montant en euros entiers (ex. 650 → "650 €"). */
export function formatPriceEur(price: number | null | undefined): string {
  if (!price || price <= 0) return '—'
  return `${price} €`
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  none: 'Non facturé',
  pending: 'Paiement en attente',
  paid: 'Payé',
}

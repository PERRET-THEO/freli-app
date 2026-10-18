/**
 * Single source of truth for project payment lifecycle state.
 *
 * Unlock uses checklist item `completed` (client submit / contract signed),
 * NOT agency `review_status` approval. Once `payment_unlocked_at` is set,
 * payment stays unlocked even if a prior step is reopened for correction.
 */

import { formatEuro } from './formatEuro'

export { formatEuro }

export type PaymentUnlockMode = 'after_prerequisites' | 'immediate'

export type PaymentAmountType = 'full' | 'deposit'

/** Persisted Stripe / ledger statuses on projects.payment_status */
export type PaymentDbStatus = 'pending' | 'paid' | 'failed' | 'refunded'

/**
 * Derived UI/API lifecycle. `not_available` | `available` | `link_created` |
 * `link_sent` are never stored; `paid` | `failed` | `refunded` come from
 * payment_status.
 *
 * - link_created: Checkout session URL exists, no payment email sent yet
 * - link_sent: last_payment_email_sent_at is set
 */
export type PaymentLifecycleState =
  | 'not_available'
  | 'available'
  | 'link_created'
  | 'link_sent'
  | 'paid'
  | 'failed'
  | 'refunded'

/** @deprecated Prefer PaymentLifecycleState via resolvePaymentState */
export type PaymentState = 'none' | 'pending' | 'paid'

export type PaymentChecklistItem = {
  type: string
  completed: boolean
  required?: boolean | null
  order_index: number
}

export type PaymentUnlockInfo = {
  unlocked: boolean
  /** Sticky unlock already recorded */
  sticky: boolean
  /** Prerequisites currently satisfied (ignores sticky) */
  prerequisitesMet: boolean
  lockReason: 'contract' | 'steps' | null
  /** 1-based display indexes of blocking previous required steps */
  blockingStepNumbers: number[]
  lockMessage: string | null
}

export type ResolvePaymentStateInput = {
  price: number | null | undefined
  paymentStatus: string | null | undefined
  unlockMode?: PaymentUnlockMode | string | null
  paymentUnlockedAt?: string | null
  lastPaymentEmailSentAt?: string | null
  stripeCheckoutUrl?: string | null
  /** When omitted, unlock is inferred only from sticky / immediate */
  unlockInfo?: Pick<PaymentUnlockInfo, 'unlocked'> | null
}

export function hasBillablePrice(price: number | null | undefined): boolean {
  return Boolean(price && price > 0)
}

export function parseUnlockMode(
  raw: string | null | undefined,
): PaymentUnlockMode {
  return raw === 'immediate' ? 'immediate' : 'after_prerequisites'
}

/**
 * Unlock evaluation based on `completed` only (not agency review).
 * Sticky `paymentUnlockedAt` prevents re-lock after a correction request.
 */
export function getPaymentUnlockInfo(input: {
  unlockMode: PaymentUnlockMode | string | null | undefined
  paymentUnlockedAt?: string | null
  items: PaymentChecklistItem[]
}): PaymentUnlockInfo {
  const mode = parseUnlockMode(input.unlockMode)
  const sticky = Boolean(input.paymentUnlockedAt)
  const sorted = [...input.items].sort((a, b) => a.order_index - b.order_index)

  if (mode === 'immediate') {
    return {
      unlocked: true,
      sticky,
      prerequisitesMet: true,
      lockReason: null,
      blockingStepNumbers: [],
      lockMessage: null,
    }
  }

  const paymentIndex = sorted.findIndex((item) => item.type === 'payment')
  const preceding =
    paymentIndex >= 0 ? sorted.slice(0, paymentIndex) : sorted

  const blocking = preceding.filter(
    (item) => (item.required !== false) && !item.completed,
  )
  const blockingStepNumbers = blocking.map((item) => {
    const idx = sorted.findIndex(
      (candidate) =>
        candidate.order_index === item.order_index && candidate.type === item.type,
    )
    return idx >= 0 ? idx + 1 : item.order_index + 1
  })

  const prerequisitesMet = blocking.length === 0
  const unlocked = sticky || prerequisitesMet

  if (unlocked) {
    return {
      unlocked: true,
      sticky,
      prerequisitesMet,
      lockReason: null,
      blockingStepNumbers: [],
      lockMessage: null,
    }
  }

  const hasUnsignedContract = blocking.some((item) => item.type === 'signature')
  const lockReason: 'contract' | 'steps' = hasUnsignedContract ? 'contract' : 'steps'
  const lockMessage =
    lockReason === 'contract'
      ? 'Disponible après la signature du contrat'
      : `Disponible après les étapes ${formatStepRange(blockingStepNumbers)}`

  return {
    unlocked: false,
    sticky,
    prerequisitesMet: false,
    lockReason,
    blockingStepNumbers,
    lockMessage,
  }
}

function formatStepRange(numbers: number[]): string {
  if (numbers.length === 0) return ''
  if (numbers.length === 1) return String(numbers[0])
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  if (max - min + 1 === numbers.length) return `${min} à ${max}`
  return numbers.join(', ')
}

export function resolvePaymentState(
  input: ResolvePaymentStateInput,
): PaymentLifecycleState | null {
  if (!hasBillablePrice(input.price)) return null

  const status = input.paymentStatus ?? 'pending'
  if (status === 'paid') return 'paid'
  if (status === 'failed') return 'failed'
  if (status === 'refunded') return 'refunded'

  const mode = parseUnlockMode(input.unlockMode)
  const unlocked =
    input.unlockInfo != null
      ? input.unlockInfo.unlocked
      : Boolean(input.paymentUnlockedAt) || mode === 'immediate'

  if (!unlocked) return 'not_available'

  if (input.lastPaymentEmailSentAt) return 'link_sent'
  if (input.stripeCheckoutUrl) return 'link_created'
  return 'available'
}

/** @deprecated Use resolvePaymentState — kept for gradual call-site migration */
export function getPaymentState(
  price: number | null | undefined,
  paymentStatus: string | null | undefined,
): PaymentState {
  if (!hasBillablePrice(price)) return 'none'
  if (paymentStatus === 'paid') return 'paid'
  return 'pending'
}

/** @deprecated Prefer formatEuro */
export function formatPriceEur(price: number | null | undefined): string {
  return formatEuro(price)
}

/** Parse a French/EN price input into euros with at most 2 decimals, or null. */
export function parsePriceInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!normalized) return null
  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  const cents = Math.round(n * 100)
  if (Math.abs(n * 100 - cents) > 1e-8) return null
  return cents / 100
}

export function canEditProjectPrice(
  lifecycle: PaymentLifecycleState | null,
): boolean {
  return (
    lifecycle === 'not_available' ||
    lifecycle === 'available' ||
    lifecycle === 'link_created' ||
    lifecycle === 'link_sent'
  )
}

export function defaultPaymentItemLabel(
  amountType: PaymentAmountType | string | null | undefined = 'full',
): string {
  return amountType === 'deposit' ? 'Régler l’acompte' : 'Paiement'
}

export function formatPaymentStepCopy(input: {
  price: number | null | undefined
  isLastStep: boolean
}): string {
  const amount = formatEuro(input.price)
  if (input.isLastStep) {
    return `Réglez ${amount} — paiement sécurisé via Stripe.`
  }
  return `Réglez ${amount} pour poursuivre — paiement sécurisé via Stripe.`
}

export const PAYMENT_LIFECYCLE_LABELS: Record<PaymentLifecycleState, string> = {
  not_available: 'Pas encore disponible',
  available: 'Prêt à envoyer',
  link_created: 'Lien de paiement créé',
  link_sent: 'Lien envoyé',
  paid: 'Payé',
  failed: 'Échec du paiement',
  refunded: 'Remboursé',
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  none: 'Non facturé',
  pending: 'Paiement en attente',
  paid: 'Payé',
}

/** Agency-facing helper text under the unlock toggle */
export const PAYMENT_UNLOCK_HELP =
  'Par défaut, le paiement se débloque quand les étapes précédentes obligatoires sont soumises par le client (contrat signé inclus). La validation agence n’est pas requise. Une fois débloqué, le paiement reste accessible même si une étape repasse en correction.'

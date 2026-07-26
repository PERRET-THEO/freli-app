import { supabase } from './supabase'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

/** Forme minimale requise pour raisonner sur la revue d'un item. */
export type ReviewableItem = {
  id: string
  label: string
  type: string
  completed: boolean
  review_status: ReviewStatus | null
  review_note: string | null
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'À valider',
  approved: 'Validé',
  rejected: 'Correction demandée',
}

/**
 * La revue porte sur ce que le client saisit ou dépose. Un contrat signé se
 * réémet (nouvelle signature), il ne se « refuse » pas ; un paiement est
 * arbitré par Stripe.
 */
const NON_REVIEWABLE_TYPES = new Set(['signature', 'payment'])

export function isReviewableType(type: string): boolean {
  return !NON_REVIEWABLE_TYPES.has(type)
}

export function getReviewStatus(
  item: Pick<ReviewableItem, 'review_status'>,
): ReviewStatus {
  return item.review_status ?? 'pending'
}

/** Transmis par le client et encore non arbitré par l'agence. */
export function isAwaitingReview(
  item: Pick<ReviewableItem, 'completed' | 'type' | 'review_status'>,
): boolean {
  return item.completed && isReviewableType(item.type) && getReviewStatus(item) === 'pending'
}

export function isRejected(item: Pick<ReviewableItem, 'review_status'>): boolean {
  return getReviewStatus(item) === 'rejected'
}

export function countAwaitingReview(items: ReviewableItem[]): number {
  return items.filter(isAwaitingReview).length
}

export function countRejected(items: ReviewableItem[]): number {
  return items.filter(isRejected).length
}

export type ReviewSummary = {
  awaitingReview: number
  rejected: number
  approved: number
  /** Aucune action de revue en attente côté agence ni côté client. */
  settled: boolean
}

export function getReviewSummary(items: ReviewableItem[]): ReviewSummary {
  const awaitingReview = countAwaitingReview(items)
  const rejected = countRejected(items)
  const approved = items.filter(
    (item) => item.completed && getReviewStatus(item) === 'approved',
  ).length

  return {
    awaitingReview,
    rejected,
    approved,
    settled: awaitingReview === 0 && rejected === 0,
  }
}

/**
 * Un onboarding n'est réellement terminé que si tout est complété et qu'aucune
 * correction n'est en attente côté client.
 */
export function isOnboardingSettled(items: ReviewableItem[]): boolean {
  if (items.length === 0) return false
  if (!items.every((item) => item.completed)) return false
  return countRejected(items) === 0
}

/** Libellé court affiché sur l'étape côté agence. */
export function getReviewBadgeLabel(item: ReviewableItem): string | null {
  if (!item.completed && isRejected(item)) return REVIEW_STATUS_LABELS.rejected
  if (!item.completed) return null
  if (!isReviewableType(item.type)) return null
  return REVIEW_STATUS_LABELS[getReviewStatus(item)]
}

export async function approveChecklistItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_items')
    .update({
      review_status: 'approved',
      review_note: null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
}

/**
 * Refuser rouvre l'étape côté client (completed = false) avec le motif, sans
 * effacer la valeur précédente : le client voit ce qu'il avait transmis.
 */
export async function rejectChecklistItem(itemId: string, note: string): Promise<void> {
  const trimmed = note.trim()
  if (!trimmed) throw new Error('Indique ce qui doit être corrigé.')

  const { error } = await supabase
    .from('checklist_items')
    .update({
      review_status: 'rejected',
      review_note: trimmed,
      reviewed_at: new Date().toISOString(),
      completed: false,
    })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
}

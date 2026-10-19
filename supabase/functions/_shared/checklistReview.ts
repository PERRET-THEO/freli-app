/**
 * Miroir de `src/lib/checklistReview.ts` pour les Edge Functions.
 * Revue agence : types non reviewables, pending / rejected.
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

const NON_REVIEWABLE_TYPES = new Set(['signature', 'payment'])

export function isReviewableType(type: string): boolean {
  return !NON_REVIEWABLE_TYPES.has(type)
}

export function getReviewStatus(
  item: { review_status?: ReviewStatus | null },
): ReviewStatus {
  return item.review_status ?? 'pending'
}

export function isAwaitingReview(item: {
  completed: boolean
  type: string
  review_status?: ReviewStatus | null
}): boolean {
  return item.completed && isReviewableType(item.type) && getReviewStatus(item) === 'pending'
}

export function isRejected(item: { review_status?: ReviewStatus | null }): boolean {
  return getReviewStatus(item) === 'rejected'
}

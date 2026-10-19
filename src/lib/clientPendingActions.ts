/**
 * Actions encore attendues CÔTÉ CLIENT (non envoyées ou correction demandée).
 * Indépendant de getBlockingStep : on peut relancer le client même si une
 * étape précédente attend la validation agence.
 */
import { getVisibleItems } from './checklistConditions'
import { isRejected, type ReviewStatus } from './checklistReview'

export type ClientActionItem = {
  label: string
  type: string
  completed: boolean
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  review_note?: string | null
  config?: { visibleWhen?: unknown } | null
}

export function getClientPendingActions<T extends ClientActionItem>(items: T[]): T[] {
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index)
  const visible = getVisibleItems(ordered)
  return visible.filter((item) => {
    if (isRejected(item)) return true
    return !item.completed
  })
}

export function hasClientPendingActions(items: ClientActionItem[]): boolean {
  return getClientPendingActions(items).length > 0
}

/** Compte les étapes visibles en attente de validation agence. */
export function getAgencyPendingReviewItems<T extends ClientActionItem & {
  review_status: ReviewStatus | null
}>(
  items: T[],
  isAwaiting: (item: T) => boolean,
): T[] {
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index)
  return getVisibleItems(ordered).filter(isAwaiting)
}

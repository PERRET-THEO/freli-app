/**
 * Actions encore attendues CÔTÉ CLIENT (non envoyées ou correction demandée).
 * Indépendant de l'étape bloquante d'affichage : on relance dès qu'il existe
 * ≥ 1 action client, même si une étape précédente attend la validation agence.
 */
import { isItemVisible, type VisibilityItem } from './checklistVisibility.ts'
import { isRejected, type ReviewStatus } from './checklistReview.ts'

export type ClientActionItem = VisibilityItem & {
  label: string
  type: string
  order_index?: number
  review_status?: ReviewStatus | null
  review_note?: string | null
}

/**
 * Étapes visibles où le client doit encore agir :
 * - non complétée (pas encore envoyée), ou
 * - correction demandée (rejected → completed=false en pratique).
 * Exclut les étapes « à valider » (completed + pending review).
 */
export function getClientPendingActions<T extends ClientActionItem>(
  orderedItems: T[],
): T[] {
  const ordered = [...orderedItems].sort((a, b) => {
    const ao = typeof a.order_index === 'number' ? a.order_index : 0
    const bo = typeof b.order_index === 'number' ? b.order_index : 0
    return ao - bo
  })
  return ordered.filter((item) => {
    if (!isItemVisible(item, ordered)) return false
    if (isRejected(item)) return true
    return !item.completed
  })
}

export function hasClientPendingActions(items: ClientActionItem[]): boolean {
  return getClientPendingActions(items).length > 0
}

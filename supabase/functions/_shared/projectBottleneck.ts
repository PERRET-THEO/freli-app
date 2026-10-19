/**
 * Miroir de `src/lib/projectBottleneck.ts` — source unique d'affichage
 * « étape bloquante » côté Edge (prompt IA, logs). La décision d'ENVOI
 * d'une relance client utilise getClientPendingActions, pas ce helper.
 */
import { isItemVisible } from './checklistVisibility.ts'
import {
  getReviewStatus,
  isAwaitingReview,
  isRejected,
  type ReviewStatus,
} from './checklistReview.ts'

export type BottleneckOwner = 'client' | 'agency'

export type BottleneckItem = {
  label: string
  type: string
  completed: boolean
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  submitted_at: string | null
  reviewed_at?: string | null
  config?: { visibleWhen?: unknown } | null
}

export type ProjectBottleneck = {
  label: string
  owner: BottleneckOwner
  since: string
}

/** Alias canonique — affichage fiche / cartes / libellé IA. */
export function getBlockingStep(
  items: BottleneckItem[],
  projectCreatedAt: string,
): ProjectBottleneck | null {
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index)
  const visible = ordered.filter((item) => isItemVisible(item, ordered))

  for (let index = 0; index < visible.length; index += 1) {
    const item = visible[index]

    if (isRejected(item)) {
      return {
        label: item.label,
        owner: 'client',
        since: item.reviewed_at ?? item.submitted_at ?? projectCreatedAt,
      }
    }

    if (isAwaitingReview(item)) {
      return {
        label: item.label,
        owner: 'agency',
        since: item.submitted_at ?? projectCreatedAt,
      }
    }

    if (!item.completed) {
      const previous = visible
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.completed)
      return {
        label: item.label,
        owner: 'client',
        since: previous?.submitted_at ?? projectCreatedAt,
      }
    }

    if (getReviewStatus(item) === 'pending' && item.completed) {
      continue
    }
  }

  return null
}

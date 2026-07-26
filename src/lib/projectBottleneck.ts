import { getVisibleItems } from './checklistConditions'
import {
  getReviewStatus,
  isAwaitingReview,
  isRejected,
  type ReviewStatus,
} from './checklistReview'

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
  /** Instant à partir duquel l'étape est bloquante. */
  since: string
}

/**
 * Première étape visible qui bloque l'avancement :
 * - côté client : non complétée, ou correction demandée ;
 * - côté agence : transmise et en attente de validation.
 */
export function findProjectBottleneck(
  items: BottleneckItem[],
  projectCreatedAt: string,
): ProjectBottleneck | null {
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index)
  const visible = getVisibleItems(ordered)

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
      // Début du blocage = soumission de l'étape précédente visible, sinon création.
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

    // Complété + reviewable + approved (ou non reviewable) → on passe.
    if (getReviewStatus(item) === 'pending' && item.completed) {
      // Signature / paiement : pas de revue agence, considérés OK dès completed.
      continue
    }
  }

  return null
}

/** Libellé court pour carte / bandeau (ex. "Bloqué : Charte UI · 3 j"). */
export function formatBottleneckLabel(
  bottleneck: ProjectBottleneck,
  now: number = Date.now(),
): string {
  const age = formatBottleneckAge(bottleneck.since, now)
  const prefix = bottleneck.owner === 'agency' ? 'À valider' : 'Bloqué'
  return age ? `${prefix} : ${bottleneck.label} · ${age}` : `${prefix} : ${bottleneck.label}`
}

/** Durée courte sans « il y a » (ex. "3 j", "5 h"). */
export function formatBottleneckAge(sinceIso: string, now: number = Date.now()): string {
  const diff = now - new Date(sinceIso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return ''
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins <= 1 ? '1 min' : `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 j' : `${days} j`
}

export function isBottleneckStale(
  bottleneck: ProjectBottleneck | null,
  now: number = Date.now(),
  thresholdMs: number = 48 * 60 * 60 * 1000,
): boolean {
  if (!bottleneck) return false
  return now - new Date(bottleneck.since).getTime() >= thresholdMs
}

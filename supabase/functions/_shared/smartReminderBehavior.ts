/**
 * Catégorisation comportementale des relances intelligentes.
 * Règles déterministes — aucune IA. Source unique pour batch et requête manuelle.
 */

export type BehaviorCategory = 'not_opened' | 'opened_not_clicked' | 'stuck_on_step'

export type BehaviorResult = {
  behaviorCategory: BehaviorCategory
  blockingStepLabel?: string
}

type ChecklistItemLike = {
  label: string
  completed: boolean
}

type EmailEventCounts = {
  opened: number
  clicked: number
}

/**
 * 1. Portail visité ou étape complétée → stuck_on_step
 * 2. Sinon opened ou clicked → opened_not_clicked
 * 3. Sinon → not_opened
 */
export function categorizeClientBehavior(input: {
  lastPortalVisitAt: string | null
  items: ChecklistItemLike[]
  emailEvents: EmailEventCounts
}): BehaviorResult {
  const firstIncomplete = input.items.find((item) => !item.completed)
  const hasVisitedPortal =
    input.lastPortalVisitAt !== null || input.items.some((item) => item.completed)

  if (hasVisitedPortal && firstIncomplete) {
    return {
      behaviorCategory: 'stuck_on_step',
      blockingStepLabel: firstIncomplete.label,
    }
  }

  if (input.emailEvents.opened > 0 || input.emailEvents.clicked > 0) {
    return { behaviorCategory: 'opened_not_clicked' }
  }

  return { behaviorCategory: 'not_opened' }
}

/** Plage horaire Europe/Paris — true si l'heure courante est dans [start, end). */
export function isWithinParisSendWindow(
  now: Date,
  startHour: number,
  endHour: number,
): boolean {
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
  if (startHour === endHour) return true
  if (startHour < endHour) return parisHour >= startHour && parisHour < endHour
  return parisHour >= startHour || parisHour < endHour
}

export const DRAFT_STALE_HOURS = 24

import { isValidHttpUrl, normalizeUrl } from './checklistFields'

export type ScheduleProvider = 'calendly' | 'calcom' | 'other'

/**
 * Détecte un lien portail Freli (/p/…) saisi par erreur à la place
 * d'un vrai lien Calendly / Cal.com.
 */
export function isFreliPortalUrl(rawUrl: string): boolean {
  const normalized = normalizeUrl(rawUrl)
  if (!normalized) return false
  try {
    const url = new URL(normalized)
    return /^\/p\/[^/]+\/?$/i.test(url.pathname)
  } catch {
    return false
  }
}

/** Identifie le fournisseur à partir de l'URL de réservation. */
export function getScheduleProvider(rawUrl: string): ScheduleProvider {
  const normalized = normalizeUrl(rawUrl)
  if (!normalized || !isValidHttpUrl(normalized)) return 'other'
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'calendly.com' || host.endsWith('.calendly.com')) return 'calendly'
    if (host === 'cal.com' || host.endsWith('.cal.com')) return 'calcom'
    return 'other'
  } catch {
    return 'other'
  }
}

/**
 * Convertit un lien de réservation en URL d'iframe quand le fournisseur
 * le permet (Calendly, Cal.com). Sinon renvoie null → lien externe.
 */
export function toScheduleEmbedUrl(rawUrl: string): string | null {
  const normalized = normalizeUrl(rawUrl)
  if (!normalized || !isValidHttpUrl(normalized)) return null

  const provider = getScheduleProvider(normalized)
  if (provider === 'other') return null

  try {
    const url = new URL(normalized)
    if (provider === 'calendly') {
      url.searchParams.set('hide_gdpr_banner', '1')
      url.searchParams.set('embed_type', 'Inline')
    }
    if (provider === 'calcom') {
      url.searchParams.set('embed', 'true')
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Détecte le message postMessage émis après une réservation réussie
 * (Calendly ou Cal.com).
 */
export function isScheduleBookingMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const payload = data as Record<string, unknown>

  // Calendly : { event: 'calendly.event_scheduled', payload: {...} }
  if (payload.event === 'calendly.event_scheduled') return true

  // Cal.com (plusieurs variantes selon la version du widget)
  if (payload.originator === 'CAL' && typeof payload.type === 'string') {
    return payload.type === 'bookingSuccessful' || payload.type === 'bookingSuccessfulV2'
  }
  if (payload.type === 'bookingSuccessful' || payload.type === 'bookingSuccessfulV2') {
    return true
  }
  if (payload.event === 'bookingSuccessful') return true

  return false
}

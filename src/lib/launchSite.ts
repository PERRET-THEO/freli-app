export const LAUNCH_HOST = 'lancement.freli.fr'
export const LAUNCH_ORIGIN = 'https://lancement.freli.fr'

export function isLaunchHost(hostname?: string): boolean {
  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  return host === LAUNCH_HOST
}

/** URL canonique de la page de lancement (partage + aperçu local). */
export function launchPageUrl(): string {
  if (typeof window === 'undefined') return LAUNCH_ORIGIN
  const { hostname, origin } = window.location
  if (hostname === LAUNCH_HOST) return origin
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${origin}/lancement`
  }
  return LAUNCH_ORIGIN
}

export function launchUnsubscribePath(): string {
  if (typeof window !== 'undefined' && isLaunchHost()) return '/desinscription'
  return '/lancement/desinscription'
}

const PRODUCTION_APP_ORIGIN = 'https://app.freli.fr'

function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, '')
}

/** Origin canonique de l'application (auth, dashboard, emails). */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_APP_URL
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return normalizeOrigin(fromEnv.trim())
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'freli.fr' || host === 'www.freli.fr') {
      return PRODUCTION_APP_ORIGIN
    }
    return window.location.origin
  }

  return PRODUCTION_APP_ORIGIN
}

export function appSignInUrl(): string {
  return `${getAppOrigin()}/signin`
}

export function appPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (typeof window === 'undefined') {
    return `${getAppOrigin()}${normalized}`
  }
  const host = window.location.hostname
  if (host === 'freli.fr' || host === 'www.freli.fr') {
    return `${PRODUCTION_APP_ORIGIN}${normalized}`
  }
  return normalized
}

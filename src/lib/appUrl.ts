import { siteConfig } from './seo/siteConfig'

const PRODUCTION_APP_ORIGIN = 'https://app.freli.fr'
const PRODUCTION_MARKETING_ORIGIN = siteConfig.siteUrl

function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, '')
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/'
  return path.startsWith('/') ? path : `/${path}`
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
  const normalized = normalizePath(path)
  if (typeof window === 'undefined') {
    return `${getAppOrigin()}${normalized}`
  }
  const host = window.location.hostname
  if (host === 'freli.fr' || host === 'www.freli.fr') {
    return `${PRODUCTION_APP_ORIGIN}${normalized}`
  }
  return normalized
}

/** Origin canonique du site marketing (landing, tarifs…). */
export function getMarketingOrigin(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'app.freli.fr') {
      return PRODUCTION_MARKETING_ORIGIN
    }
    return window.location.origin
  }
  return PRODUCTION_MARKETING_ORIGIN
}

/**
 * URL vers une page marketing.
 * Sur app.freli.fr → absolue www.freli.fr (évite Link same-origin vers le mauvais host).
 * En local / déjà sur le marketing → chemin relatif.
 */
export function marketingUrl(path = '/'): string {
  const normalized = normalizePath(path)
  if (typeof window === 'undefined') {
    return `${PRODUCTION_MARKETING_ORIGIN}${normalized === '/' ? '' : normalized}`
  }
  const host = window.location.hostname
  if (host === 'app.freli.fr') {
    return `${PRODUCTION_MARKETING_ORIGIN}${normalized === '/' ? '' : normalized}`
  }
  return normalized
}

export function marketingHomeUrl(): string {
  return marketingUrl('/')
}

export type CookieConsentChoice = 'accepted' | 'refused'

const STORAGE_KEY = 'freli_cookie_consent'

export function isMarketingSite(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'freli.fr' || host === 'www.freli.fr' || host === 'localhost' || host === '127.0.0.1'
}

export function getCookieConsent(): CookieConsentChoice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'accepted' || raw === 'refused') return raw
    return null
  } catch {
    return null
  }
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // localStorage indisponible (mode privé, quota…) — choix ignoré silencieusement
  }
}

export function shouldShowCookieBanner(): boolean {
  return isMarketingSite() && getCookieConsent() === null
}

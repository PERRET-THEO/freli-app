/** Version du texte de consentement affiché sur la page de lancement. */
export const WAITLIST_CONSENT_TEXT_VERSION = 'lancement-v1'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeWaitlistEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidWaitlistEmail(email: string): boolean {
  const normalized = normalizeWaitlistEmail(email)
  return normalized.length > 0 && normalized.length <= 254 && EMAIL_RE.test(normalized)
}

export function isValidWaitlistFirstName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 80
}

export function isValidUnsubscribeToken(token: string): boolean {
  return UUID_RE.test(token.trim())
}

export function isHoneypotFilled(website: unknown): boolean {
  return typeof website === 'string' && website.trim().length > 0
}

export function parseWaitlistSignupBody(body: unknown):
  | { ok: true; firstName: string; email: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Requête invalide' }
  }
  const record = body as Record<string, unknown>
  const firstName = typeof record.firstName === 'string' ? record.firstName.trim() : ''
  const email = typeof record.email === 'string' ? normalizeWaitlistEmail(record.email) : ''
  const consent = record.consent === true

  if (!isValidWaitlistFirstName(firstName)) {
    return { ok: false, error: 'Merci d’indiquer votre prénom' }
  }
  if (!isValidWaitlistEmail(email)) {
    return { ok: false, error: 'Merci d’indiquer un email valide' }
  }
  if (!consent) {
    return { ok: false, error: 'Merci de cocher la case de consentement' }
  }
  return { ok: true, firstName, email }
}

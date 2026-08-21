const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

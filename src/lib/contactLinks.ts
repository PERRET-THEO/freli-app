import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

export type ClientAddressParts = {
  street?: string | null
  postal?: string | null
  city?: string | null
  country?: string | null
}

export type ParsedPhone = {
  e164: string
  display: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidContactEmail(email: string): boolean {
  const value = email.trim()
  return value.length > 0 && value.length <= 254 && EMAIL_RE.test(value)
}

/** Parse un numéro FR (ou E.164 international) ; null si invalide. */
export function parseAgencyPhone(phone: string | null | undefined): ParsedPhone | null {
  const raw = (phone ?? '').trim()
  if (!raw) return null
  const parsed = parsePhoneNumberFromString(raw, 'FR')
  if (!parsed || !parsed.isValid()) return null
  return {
    e164: parsed.format('E.164'),
    display: parsed.formatNational(),
  }
}

/** Normalise pour stockage DB (E.164) ; null si vide ou invalide. */
export function normalizeContactPhone(phone: string | null | undefined): string | null {
  const parsed = parseAgencyPhone(phone)
  return parsed?.e164 ?? null
}

export function formatPhoneDisplay(phone: string | null | undefined): string | null {
  const parsed = parseAgencyPhone(phone)
  if (parsed) return parsed.display
  const raw = (phone ?? '').trim()
  return raw || null
}

export function mailtoHref(email: string, subject?: string): string {
  const base = `mailto:${email.trim()}`
  if (!subject?.trim()) return base
  return `${base}?subject=${encodeURIComponent(subject.trim())}`
}

export function telHref(phone: string): string {
  const parsed = parseAgencyPhone(phone)
  if (parsed) return `tel:${parsed.e164}`
  const normalized = phone.replace(/[\s.-]/g, '')
  return `tel:${normalized}`
}

export function formatClientAddress(parts: ClientAddressParts): string | null {
  const line = [parts.street, parts.postal, parts.city, parts.country]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  return line || null
}

export function mapsAppleHref(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`
}

export function mapsGoogleHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function wazeHref(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const platform = navigator.platform ?? ''
  return /Mac|iPhone|iPad|iPod/i.test(ua) || /Mac|iPhone|iPad|iPod/i.test(platform)
}

export function defaultMapsHref(address: string): string {
  return isApplePlatform() ? mapsAppleHref(address) : mapsGoogleHref(address)
}

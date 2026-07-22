export type ClientAddressParts = {
  street?: string | null
  postal?: string | null
  city?: string | null
  country?: string | null
}

export function mailtoHref(email: string): string {
  return `mailto:${email.trim()}`
}

export function telHref(phone: string): string {
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

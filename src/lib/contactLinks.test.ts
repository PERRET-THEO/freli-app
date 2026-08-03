import { describe, expect, it } from 'vitest'
import {
  formatClientAddress,
  formatPhoneDisplay,
  isNavigableAddress,
  isValidContactEmail,
  mailtoHref,
  mapsAppleHref,
  mapsGoogleHref,
  normalizeContactPhone,
  parseAgencyPhone,
  telHref,
  wazeHref,
} from './contactLinks'

describe('contactLinks', () => {
  it('builds mailto href', () => {
    expect(mailtoHref('client@example.com')).toBe('mailto:client@example.com')
  })

  it('builds mailto href with encoded subject', () => {
    expect(mailtoHref('a@b.co', 'Projet Site vitrine')).toBe(
      'mailto:a@b.co?subject=Projet%20Site%20vitrine',
    )
  })

  it('validates contact emails', () => {
    expect(isValidContactEmail('ok@freli.fr')).toBe(true)
    expect(isValidContactEmail('bad')).toBe(false)
    expect(isValidContactEmail('')).toBe(false)
  })

  it('parses and formats French phones to E.164', () => {
    expect(parseAgencyPhone('06 12 34 56 78')).toEqual({
      e164: '+33612345678',
      display: '06 12 34 56 78',
    })
    expect(normalizeContactPhone('06.12.34.56.78')).toBe('+33612345678')
    expect(telHref('+33 6 12 34 56 78')).toBe('tel:+33612345678')
    expect(telHref('06.12.34.56.78')).toBe('tel:+33612345678')
    expect(formatPhoneDisplay('+33612345678')).toBe('06 12 34 56 78')
  })

  it('rejects invalid phones', () => {
    expect(parseAgencyPhone('123')).toBeNull()
    expect(normalizeContactPhone('abc')).toBeNull()
  })

  it('formats client address', () => {
    expect(
      formatClientAddress({
        street: '1 rue de Paris',
        postal: '75001',
        city: 'Paris',
        country: 'France',
      }),
    ).toBe('1 rue de Paris, 75001, Paris, France')
    expect(formatClientAddress({})).toBeNull()
  })

  it('requires street or postal+city for navigation', () => {
    expect(isNavigableAddress({ country: 'France' })).toBe(false)
    expect(isNavigableAddress({ street: '1 rue de Paris', country: 'France' })).toBe(true)
    expect(isNavigableAddress({ postal: '75001', city: 'Paris' })).toBe(true)
  })

  it('encodes address in map urls', () => {
    const address = '1 rue de Paris, 75001, Paris'
    expect(mapsAppleHref(address)).toBe(
      `https://maps.apple.com/?q=${encodeURIComponent(address)}`,
    )
    expect(mapsGoogleHref(address)).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    )
    expect(wazeHref(address)).toBe(
      `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`,
    )
  })
})

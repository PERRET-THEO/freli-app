import { describe, expect, it } from 'vitest'
import {
  formatClientAddress,
  mailtoHref,
  mapsAppleHref,
  mapsGoogleHref,
  telHref,
  wazeHref,
} from './contactLinks'

describe('contactLinks', () => {
  it('builds mailto href', () => {
    expect(mailtoHref('client@example.com')).toBe('mailto:client@example.com')
  })

  it('normalizes phone for tel href', () => {
    expect(telHref('+33 6 12 34 56 78')).toBe('tel:+33612345678')
    expect(telHref('06.12.34.56.78')).toBe('tel:0612345678')
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

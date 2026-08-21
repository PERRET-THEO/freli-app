import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCookieConsent,
  isMarketingSite,
  setCookieConsent,
  shouldShowCookieBanner,
} from './cookieConsent'

function mockHost(hostname: string) {
  vi.stubGlobal('window', {
    location: { hostname, origin: `https://${hostname}` },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('isMarketingSite', () => {
  it('returns true on freli.fr and www.freli.fr', () => {
    mockHost('freli.fr')
    expect(isMarketingSite()).toBe(true)

    mockHost('www.freli.fr')
    expect(isMarketingSite()).toBe(true)
  })

  it('returns false on app.freli.fr', () => {
    mockHost('app.freli.fr')
    expect(isMarketingSite()).toBe(false)
  })

  it('returns false on lancement.freli.fr', () => {
    mockHost('lancement.freli.fr')
    expect(isMarketingSite()).toBe(false)
    expect(shouldShowCookieBanner()).toBe(false)
  })

  it('returns true on localhost for local dev', () => {
    mockHost('localhost')
    expect(isMarketingSite()).toBe(true)

    mockHost('127.0.0.1')
    expect(isMarketingSite()).toBe(true)
  })
})

describe('cookie consent storage', () => {
  beforeEach(() => {
    mockHost('www.freli.fr')
  })

  it('returns null when no choice is stored', () => {
    expect(getCookieConsent()).toBeNull()
  })

  it('persists accepted and refused choices', () => {
    setCookieConsent('accepted')
    expect(getCookieConsent()).toBe('accepted')
    expect(localStorage.getItem('freli_cookie_consent')).toBe('accepted')

    setCookieConsent('refused')
    expect(getCookieConsent()).toBe('refused')
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem('freli_cookie_consent', 'maybe')
    expect(getCookieConsent()).toBeNull()
  })
})

describe('shouldShowCookieBanner', () => {
  it('shows on marketing site without prior choice', () => {
    mockHost('www.freli.fr')
    expect(shouldShowCookieBanner()).toBe(true)
  })

  it('hides after a choice is stored', () => {
    mockHost('www.freli.fr')
    setCookieConsent('refused')
    expect(shouldShowCookieBanner()).toBe(false)
  })

  it('hides on app.freli.fr', () => {
    mockHost('app.freli.fr')
    expect(shouldShowCookieBanner()).toBe(false)
  })
})

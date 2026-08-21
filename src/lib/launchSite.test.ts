import { afterEach, describe, expect, it, vi } from 'vitest'
import { isLaunchHost, launchPageUrl } from './launchSite'

function mockHost(hostname: string, origin?: string) {
  vi.stubGlobal('window', {
    location: { hostname, origin: origin ?? `https://${hostname}` },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isLaunchHost', () => {
  it('détecte lancement.freli.fr uniquement', () => {
    mockHost('lancement.freli.fr')
    expect(isLaunchHost()).toBe(true)
    mockHost('www.freli.fr')
    expect(isLaunchHost()).toBe(false)
    mockHost('app.freli.fr')
    expect(isLaunchHost()).toBe(false)
  })
})

describe('launchPageUrl', () => {
  it('retourne l’origine sur le sous-domaine de lancement', () => {
    mockHost('lancement.freli.fr')
    expect(launchPageUrl()).toBe('https://lancement.freli.fr')
  })

  it('retourne /lancement en local', () => {
    mockHost('localhost', 'http://localhost:5173')
    expect(launchPageUrl()).toBe('http://localhost:5173/lancement')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketingHomeUrl, marketingUrl } from './appUrl'

function mockHost(hostname: string) {
  vi.stubGlobal('window', {
    location: { hostname, origin: `https://${hostname}` },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('marketingUrl', () => {
  it('returns absolute www.freli.fr URLs on app.freli.fr', () => {
    mockHost('app.freli.fr')
    expect(marketingHomeUrl()).toBe('https://www.freli.fr')
    expect(marketingUrl('/')).toBe('https://www.freli.fr')
    expect(marketingUrl('/tarifs')).toBe('https://www.freli.fr/tarifs')
  })

  it('returns relative paths on localhost', () => {
    mockHost('localhost')
    expect(marketingHomeUrl()).toBe('/')
    expect(marketingUrl('/tarifs')).toBe('/tarifs')
  })

  it('returns relative paths on marketing host', () => {
    mockHost('www.freli.fr')
    expect(marketingHomeUrl()).toBe('/')
    expect(marketingUrl('/tarifs')).toBe('/tarifs')
  })
})

import { describe, expect, it } from 'vitest'
import { describeDevice, shortHash } from './signatureProof'

describe('shortHash', () => {
  it('abrège en gardant les deux extrémités', () => {
    const hash = 'a'.repeat(8) + 'b'.repeat(48) + 'c'.repeat(8)
    expect(shortHash(hash)).toBe('aaaaaaaa…cccccccc')
  })

  it('gère une empreinte absente', () => {
    expect(shortHash(null)).toBe('—')
  })
})

describe('describeDevice', () => {
  it('identifie Chrome sur Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    expect(describeDevice(ua)).toBe('Chrome · Windows')
  })

  it('identifie Safari sur iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(describeDevice(ua)).toBe('Safari · iOS')
  })

  it('distingue Edge de Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'
    expect(describeDevice(ua)).toBe('Edge · Windows')
  })

  it('identifie Firefox sur macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
    expect(describeDevice(ua)).toBe('Firefox · macOS')
  })

  it('reste lisible sur user-agent inconnu ou absent', () => {
    expect(describeDevice(null)).toBe('Appareil inconnu')
    expect(describeDevice('curl/8.0')).toBe('Navigateur')
  })
})

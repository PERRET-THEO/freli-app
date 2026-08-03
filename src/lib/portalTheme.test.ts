import { describe, expect, it } from 'vitest'
import {
  agencyInitials,
  contrastRatio,
  derivePortalTokens,
  pickForeground,
} from './portalTheme'

describe('portalTheme', () => {
  it('picks the higher-contrast foreground for indigo accent', () => {
    const fg = pickForeground('#5b6ef5')
    expect(['#ffffff', '#0d0f14']).toContain(fg)
    expect(contrastRatio('#5b6ef5', fg)).toBeGreaterThanOrEqual(4.5)
  })

  it('picks dark fg on light/amber accent', () => {
    expect(pickForeground('#f5a623')).toBe('#0d0f14')
  })

  it('picks white fg on very dark accent', () => {
    expect(pickForeground('#1e3a8a')).toBe('#ffffff')
  })

  it('derives token set from one accent', () => {
    const tokens = derivePortalTokens('#8b5cf6')
    expect(tokens.accent).toBe('#8b5cf6')
    expect(tokens.accentFg).toMatch(/^#/)
    expect(tokens.accentSoft).toMatch(/^rgba\(/)
    expect(tokens.passesButtonAa).toBe(true)
  })

  it('builds agency initials', () => {
    expect(agencyInitials('Studio Nova')).toBe('SN')
    expect(agencyInitials('TOTO')).toBe('TO')
    expect(agencyInitials('')).toBe('??')
  })
})

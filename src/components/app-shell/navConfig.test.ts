import { describe, expect, it } from 'vitest'
import {
  FOOTER_NAV,
  MOBILE_MORE_NAV,
  MOBILE_PRIMARY_NAV,
  PRIMARY_NAV,
  allNavigableDestinations,
} from './navConfig'

describe('navConfig', () => {
  it('keeps a flat primary list without section headers', () => {
    expect(PRIMARY_NAV).toHaveLength(4)
    expect(PRIMARY_NAV.map((item) => item.id)).toEqual([
      'overview',
      'clients',
      'contracts',
      'integrations',
    ])
  })

  it('places settings in the footer only', () => {
    expect(FOOTER_NAV.map((item) => item.id)).toEqual(['settings'])
    expect(PRIMARY_NAV.some((item) => item.id === 'settings')).toBe(false)
  })

  it('aligns mobile destinations with desktop labels', () => {
    expect(MOBILE_PRIMARY_NAV.map((item) => item.label)).toEqual([
      "Vue d'ensemble",
      'Clients',
      'Contrats',
    ])
    expect(MOBILE_MORE_NAV.map((item) => item.label)).toEqual(['Intégrations', 'Paramètres'])
  })

  it('exposes command-palette destinations including create', () => {
    const ids = allNavigableDestinations().map((item) => item.id)
    expect(ids).toContain('new-project')
    expect(ids).toContain('overview')
    expect(ids).toContain('settings')
  })
})

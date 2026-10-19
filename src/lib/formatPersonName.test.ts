import { describe, expect, it } from 'vitest'
import {
  formatDisplayName,
  formatPersonInitials,
  formatPersonName,
  stripSireneAcronym,
} from './formatPersonName'

describe('formatPersonName', () => {
  it('title-cases first and last name for display', () => {
    expect(formatPersonName('yann', 'barthes')).toBe('Yann Barthes')
    expect(formatPersonName('JEAN-PIERRE', "d'arc")).toBe("Jean-Pierre D'Arc")
  })

  it('trims empty parts', () => {
    expect(formatPersonName('  marie  ', '')).toBe('Marie')
  })
})

describe('formatDisplayName', () => {
  it('capitalise un nom tout en majuscules et garde les particules', () => {
    expect(formatDisplayName('MARIE CLAIRE DE SOUSA')).toBe('Marie Claire de Sousa')
  })

  it('gère tirets et apostrophes', () => {
    expect(formatDisplayName("jean-pierre d'arc")).toBe("Jean-Pierre D'Arc")
  })
})

describe('stripSireneAcronym', () => {
  it('retire le sigle final sans altérer la raison sociale', () => {
    expect(stripSireneAcronym('HEPPNER EN FOREZ (HEF)')).toBe('HEPPNER EN FOREZ')
    expect(stripSireneAcronym('HEPPNER EN FOREZ')).toBe('HEPPNER EN FOREZ')
  })
})

describe('formatPersonInitials', () => {
  it('returns uppercase initials', () => {
    expect(formatPersonInitials('yann', 'barthes')).toBe('YB')
  })
})

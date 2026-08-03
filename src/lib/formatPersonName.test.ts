import { describe, expect, it } from 'vitest'
import { formatPersonInitials, formatPersonName } from './formatPersonName'

describe('formatPersonName', () => {
  it('title-cases first and last name for display', () => {
    expect(formatPersonName('yann', 'barthes')).toBe('Yann Barthes')
    expect(formatPersonName('JEAN-PIERRE', "d'arc")).toBe("Jean-Pierre D'Arc")
  })

  it('trims empty parts', () => {
    expect(formatPersonName('  marie  ', '')).toBe('Marie')
  })
})

describe('formatPersonInitials', () => {
  it('returns uppercase initials', () => {
    expect(formatPersonInitials('yann', 'barthes')).toBe('YB')
  })
})

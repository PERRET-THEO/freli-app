import { describe, expect, it } from 'vitest'
import { escapePostgrestSearch, normalizeSiretQuery } from './postgrestSearch'

describe('escapePostgrestSearch', () => {
  it('échappe les jokers ILIKE et la grammaire .or()', () => {
    expect(escapePostgrestSearch('a%b_c')).toBe('a\\%b\\_c')
    expect(escapePostgrestSearch('foo,bar')).toBe('foo\\,bar')
    expect(escapePostgrestSearch('x(y)')).toBe('x\\(y\\)')
    expect(escapePostgrestSearch('a\\b')).toBe('a\\\\b')
  })

  it('laisse une saisie simple intacte', () => {
    expect(escapePostgrestSearch('heppner')).toBe('heppner')
  })
})

describe('normalizeSiretQuery', () => {
  it('retire les espaces', () => {
    expect(normalizeSiretQuery('123 456 789 00012')).toBe('12345678900012')
  })
})

import { describe, expect, it } from 'vitest'
import { normalizeToSchema, nullFieldRatio } from './ai-provider'

describe('normalizeToSchema', () => {
  it('keeps non-empty strings and nullifies empty or unknown values', () => {
    expect(
      normalizeToSchema({ a: ' hello ', b: '', c: 'null', d: 42 }, ['a', 'b', 'c', 'd']),
    ).toEqual({ a: 'hello', b: null, c: null, d: null })
  })
})

describe('nullFieldRatio', () => {
  it('returns 1 for empty object', () => {
    expect(nullFieldRatio({})).toBe(1)
  })

  it('counts null fields', () => {
    expect(nullFieldRatio({ a: 'x', b: null, c: null })).toBeCloseTo(2 / 3)
  })
})

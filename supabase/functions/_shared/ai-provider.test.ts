import { describe, expect, it } from 'vitest'
import {
  normalizeSchemaForGemini,
  normalizeToSchema,
  nullFieldRatio,
  parseJsonOutput,
} from './ai-provider'

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

describe('normalizeSchemaForGemini', () => {
  it('converts ["string","null"] unions to nullable string', () => {
    expect(
      normalizeSchemaForGemini({
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: ['string', 'null'] },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', nullable: true },
      },
    })
  })

  it('recurses into nested objects and arrays', () => {
    const result = normalizeSchemaForGemini({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: ['string', 'null'] },
            },
          },
        },
      },
    }) as {
      properties: {
        items: {
          items: { properties: { label: { type: string; nullable?: boolean } } }
        }
      }
    }
    expect(result.properties.items.items.properties.label).toEqual({
      type: 'string',
      nullable: true,
    })
  })
})

describe('parseJsonOutput', () => {
  it('parses raw JSON object', () => {
    expect(parseJsonOutput<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips markdown fences', () => {
    expect(parseJsonOutput<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('extracts first object from surrounding text', () => {
    expect(parseJsonOutput<{ x: string }>('prefix {"x":"y"} suffix')).toEqual({ x: 'y' })
  })
})

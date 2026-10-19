import { describe, expect, it } from 'vitest'
import { commandItemValue } from './commandPaletteValues'

describe('commandItemValue', () => {
  it('produit des values uniques par kind+id', () => {
    const values = [
      commandItemValue('action', 'new-project'),
      commandItemValue('nav', 'clients'),
      commandItemValue('recent', 'abc'),
      commandItemValue('project', 'abc'),
      commandItemValue('client', 'abc'),
      commandItemValue('client', 'def'),
    ]
    expect(new Set(values).size).toBe(values.length)
  })

  it('format kind:id', () => {
    expect(commandItemValue('client', 'uuid-1')).toBe('client:uuid-1')
    expect(commandItemValue('project', 'p1')).toBe('project:p1')
  })
})

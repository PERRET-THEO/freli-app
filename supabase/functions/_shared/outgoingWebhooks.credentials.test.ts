import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Garde anti-régression : les webhooks ne doivent jamais sélectionner `value`
 * (sinon fuite credentials / legacy).
 */
describe('outgoingWebhooks checklist select', () => {
  it('ne sélectionne que label, type, completed', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'outgoingWebhooks.ts'), 'utf8')
    const match = source.match(
      /export async function fetchChecklistItems[\s\S]*?\.select\('([^']+)'\)/,
    )
    expect(match?.[1]).toBe('label, type, completed')
    expect(match?.[1]).not.toContain('value')
  })
})

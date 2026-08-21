import { describe, expect, it } from 'vitest'
import { isValidWaitlistEmail, isValidWaitlistFirstName, normalizeWaitlistEmail } from './waitlistValidation'

describe('waitlistSignup client validation', () => {
  it('normalise l’email', () => {
    expect(normalizeWaitlistEmail('  Theo@Freli.FR ')).toBe('theo@freli.fr')
  })

  it('valide le format email', () => {
    expect(isValidWaitlistEmail('ok@freli.fr')).toBe(true)
    expect(isValidWaitlistEmail('bad')).toBe(false)
    expect(isValidWaitlistEmail('')).toBe(false)
  })

  it('valide le prénom', () => {
    expect(isValidWaitlistFirstName('Théo')).toBe(true)
    expect(isValidWaitlistFirstName('  ')).toBe(false)
  })
})

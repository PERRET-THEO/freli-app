import { describe, expect, it } from 'vitest'
import { isValidSiren, isValidSiret } from '../../supabase/functions/_shared/frenchIds.ts'

describe('frenchIds', () => {
  it('valide un SIREN Luhn connu', () => {
    expect(isValidSiren('732829320')).toBe(true)
  })

  it('rejette un SIREN invalide', () => {
    expect(isValidSiren('123456789')).toBe(false)
    expect(isValidSiren('73282932')).toBe(false)
  })

  it('valide un SIRET Luhn', () => {
    expect(isValidSiret('73282932000074')).toBe(true)
  })

  it('rejette un SIRET invalide', () => {
    expect(isValidSiret('73282932000075')).toBe(false)
  })
})

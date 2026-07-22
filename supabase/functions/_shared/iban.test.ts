import { describe, expect, it } from 'vitest'
import { isValidIban } from './iban'

describe('isValidIban', () => {
  it('accepts a valid French IBAN', () => {
    expect(isValidIban('FR76 3000 6000 0112 3456 7890 189')).toBe(true)
  })

  it('rejects invalid checksum', () => {
    expect(isValidIban('FR76 3000 6000 0112 3456 7890 180')).toBe(false)
  })

  it('rejects malformed IBAN', () => {
    expect(isValidIban('NOTANIBAN')).toBe(false)
  })
})

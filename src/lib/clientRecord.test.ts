import { describe, expect, it } from 'vitest'
import { addressPatchSchema, parseClientScalarField } from './clientRecord'

describe('parseClientScalarField', () => {
  it('requires first and last name', () => {
    expect(parseClientScalarField('first_name', '  ')).toEqual({
      ok: false,
      error: 'Le prénom est requis',
    })
    expect(parseClientScalarField('last_name', '')).toEqual({
      ok: false,
      error: 'Le nom est requis',
    })
    expect(parseClientScalarField('first_name', ' Ada ')).toEqual({
      ok: true,
      value: 'Ada',
    })
  })

  it('validates email', () => {
    expect(parseClientScalarField('email', 'not-an-email').ok).toBe(false)
    expect(parseClientScalarField('email', 'ada@example.com')).toEqual({
      ok: true,
      value: 'ada@example.com',
    })
  })

  it('normalizes phone or accepts empty as null', () => {
    expect(parseClientScalarField('phone', '')).toEqual({ ok: true, value: null })
    expect(parseClientScalarField('phone', '06 12 34 56 78').ok).toBe(true)
    expect(parseClientScalarField('phone', 'abc').ok).toBe(false)
  })

  it('validates SIRET / SIREN digits', () => {
    expect(parseClientScalarField('siret', '123').ok).toBe(false)
    expect(parseClientScalarField('siret', '73282932000074')).toEqual({
      ok: true,
      value: '73282932000074',
    })
    expect(parseClientScalarField('siren', '732829320')).toEqual({
      ok: true,
      value: '732829320',
    })
  })

  it('accepts website with or without protocol', () => {
    expect(parseClientScalarField('website', 'example.com')).toEqual({
      ok: true,
      value: 'example.com',
    })
    expect(parseClientScalarField('website', 'https://example.com')).toEqual({
      ok: true,
      value: 'https://example.com',
    })
    expect(parseClientScalarField('website', '')).toEqual({ ok: true, value: null })
  })
})

describe('addressPatchSchema', () => {
  it('batches address fields and empty-to-null', () => {
    const parsed = addressPatchSchema.safeParse({
      address_street: ' 1 rue de Paris ',
      address_city: 'Paris',
      address_postal_code: '75001',
      address_country: '',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({
        address_street: '1 rue de Paris',
        address_city: 'Paris',
        address_postal_code: '75001',
        address_country: null,
      })
    }
  })
})

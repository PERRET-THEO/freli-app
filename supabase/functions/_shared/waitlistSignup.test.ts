import { describe, expect, it } from 'vitest'
import {
  isHoneypotFilled,
  isValidUnsubscribeToken,
  isValidWaitlistEmail,
  isValidWaitlistFirstName,
  parseWaitlistSignupBody,
} from './waitlistSignup.ts'

describe('waitlistSignup validation', () => {
  it('accepte un email et un prénom valides', () => {
    const parsed = parseWaitlistSignupBody({
      firstName: '  Théo  ',
      email: 'Theo@Freli.fr',
      consent: true,
    })
    expect(parsed).toEqual({ ok: true, firstName: 'Théo', email: 'theo@freli.fr' })
  })

  it('rejette un email invalide', () => {
    expect(isValidWaitlistEmail('pas-un-email')).toBe(false)
    expect(parseWaitlistSignupBody({ firstName: 'Théo', email: 'bad', consent: true })).toEqual({
      ok: false,
      error: 'Merci d’indiquer un email valide',
    })
  })

  it('rejette un prénom vide', () => {
    expect(isValidWaitlistFirstName('   ')).toBe(false)
    expect(parseWaitlistSignupBody({ firstName: ' ', email: 'ok@freli.fr', consent: true })).toEqual({
      ok: false,
      error: 'Merci d’indiquer votre prénom',
    })
  })

  it('exige un consentement explicite', () => {
    expect(
      parseWaitlistSignupBody({ firstName: 'Théo', email: 'ok@freli.fr', consent: false }),
    ).toEqual({
      ok: false,
      error: 'Merci de cocher la case de consentement',
    })
  })

  it('détecte le honeypot', () => {
    expect(isHoneypotFilled('')).toBe(false)
    expect(isHoneypotFilled('https://spam.test')).toBe(true)
  })

  it('valide un jeton de désinscription UUID', () => {
    expect(isValidUnsubscribeToken('a1b2c3d4-1111-4222-8333-444455556666')).toBe(true)
    expect(isValidUnsubscribeToken('nope')).toBe(false)
  })
})

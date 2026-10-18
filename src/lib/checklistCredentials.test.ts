import { describe, expect, it } from 'vitest'
import {
  formatRevealedCredentials,
  isSafeDisplayLoginUrl,
} from './checklistCredentials'
import {
  isCredentialsSentinel,
  isInputType,
  validateCredentialsForm,
} from './checklistFields'

describe('credentials sentinels', () => {
  it('accepte null, submitted et cleared', () => {
    expect(isCredentialsSentinel(null)).toBe(true)
    expect(isCredentialsSentinel(undefined)).toBe(true)
    expect(isCredentialsSentinel('submitted')).toBe(true)
    expect(isCredentialsSentinel('cleared')).toBe(true)
  })

  it('refuse les valeurs hors sentinelles', () => {
    expect(isCredentialsSentinel('Akira12345')).toBe(false)
    expect(isCredentialsSentinel('FauxMotDePasse123')).toBe(false)
    expect(isCredentialsSentinel('user:pass')).toBe(false)
  })
})

describe('validateCredentialsForm', () => {
  it('exige identifiant et mot de passe', () => {
    expect(validateCredentialsForm({ username: '', password: 'x', loginUrl: '' })).toBe(
      'Identifiant requis.',
    )
    expect(validateCredentialsForm({ username: 'a', password: '', loginUrl: '' })).toBe(
      'Mot de passe requis.',
    )
  })

  it('refuse loginUrl javascript:', () => {
    expect(
      validateCredentialsForm({
        username: 'a',
        password: 'b',
        loginUrl: 'javascript:alert(1)',
      }),
    ).toBe('Lien invalide (http/https uniquement).')
  })

  it('accepte http(s)', () => {
    expect(
      validateCredentialsForm({
        username: 'a',
        password: 'b',
        loginUrl: 'https://admin.exemple.fr/login',
      }),
    ).toBeNull()
  })
})

describe('isInputType credentials', () => {
  it('n’est pas un input générique (soumission via EF dédiée)', () => {
    expect(isInputType('credentials')).toBe(false)
  })
})

describe('reveal helpers', () => {
  it('formate credentials et legacy', () => {
    expect(
      formatRevealedCredentials({
        username: 'u',
        password: 'p',
        loginUrl: 'https://x.fr',
      }),
    ).toContain('Identifiant : u')
    expect(formatRevealedCredentials({ legacy: 'plain' })).toBe('plain')
  })

  it('n’affiche que les loginUrl http(s)', () => {
    expect(isSafeDisplayLoginUrl('https://ok.fr')).toBe(true)
    expect(isSafeDisplayLoginUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeDisplayLoginUrl(undefined)).toBe(false)
  })
})

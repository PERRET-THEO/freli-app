import { describe, expect, it } from 'vitest'
import { formatCount } from './formatCount'

describe('formatCount', () => {
  it('classe 0 en forme one par défaut (compteurs compacts)', () => {
    expect(formatCount(0, 'projet')).toBe('0 projet')
  })

  it('accepte zero pour les textes visibles', () => {
    expect(formatCount(0, 'projet', { zero: 'Aucun projet' })).toBe('Aucun projet')
  })

  it('singulier pour 1', () => {
    expect(formatCount(1, 'projet')).toBe('1 projet')
  })

  it('pluriel pour 2', () => {
    expect(formatCount(2, 'projet')).toBe('2 projets')
  })

  it('1,5 suit le CLDR fr (one pour 0.0–1.5), pas other', () => {
    // https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html#fr
    expect(new Intl.PluralRules('fr-FR').select(1.5)).toBe('one')
    expect(formatCount(1.5, 'projet')).toBe('1.5 projet')
  })

  it('accepte un pluriel irrégulier', () => {
    expect(formatCount(2, 'client', { plural: 'clients' })).toBe('2 clients')
    expect(formatCount(0, 'étape', { plural: 'étapes', zero: 'Aucune étape' })).toBe(
      'Aucune étape',
    )
  })
})

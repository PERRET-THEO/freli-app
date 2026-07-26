import { describe, expect, it } from 'vitest'
import {
  formatChoiceOptions,
  isInputType,
  isSingleLineType,
  isValidHttpUrl,
  normalizeClientAnswer,
  normalizeUrl,
  parseChoiceOptions,
  validateClientAnswer,
} from './checklistFields'

describe('isInputType / isSingleLineType', () => {
  it('classe les étapes de saisie', () => {
    expect(isInputType('text')).toBe(true)
    expect(isInputType('email')).toBe(true)
    expect(isInputType('choice')).toBe(true)
    expect(isInputType('file')).toBe(false)
    expect(isInputType('payment')).toBe(false)
    expect(isInputType('schedule')).toBe(false)
    expect(isInputType('signature')).toBe(false)
  })

  it('distingue les champs sur une ligne du texte libre', () => {
    expect(isSingleLineType('email')).toBe(true)
    expect(isSingleLineType('phone')).toBe(true)
    expect(isSingleLineType('url')).toBe(true)
    expect(isSingleLineType('text')).toBe(false)
    expect(isSingleLineType('choice')).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('ajoute https quand le schéma manque', () => {
    expect(normalizeUrl('exemple.fr')).toBe('https://exemple.fr')
  })

  it('préserve un schéma existant', () => {
    expect(normalizeUrl('http://exemple.fr')).toBe('http://exemple.fr')
    expect(normalizeUrl('https://exemple.fr')).toBe('https://exemple.fr')
  })

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(normalizeUrl('   ')).toBe('')
  })
})

describe('isValidHttpUrl', () => {
  it('accepte les URLs http(s) avec un hôte crédible', () => {
    expect(isValidHttpUrl('https://calendly.com/agence/kickoff')).toBe(true)
    expect(isValidHttpUrl('exemple.fr')).toBe(true)
  })

  it('rejette les hôtes sans point et les schémas non http', () => {
    expect(isValidHttpUrl('https://localhost')).toBe(false)
    expect(isValidHttpUrl('ftp://exemple.fr')).toBe(false)
    expect(isValidHttpUrl('')).toBe(false)
  })
})

describe('parseChoiceOptions / formatChoiceOptions', () => {
  it('découpe par ligne en ignorant les lignes vides', () => {
    expect(parseChoiceOptions('Oui\n\n  Non  \n')).toEqual(['Oui', 'Non'])
  })

  it('fait un aller-retour stable', () => {
    const options = ['Oui', 'Non']
    expect(parseChoiceOptions(formatChoiceOptions(options))).toEqual(options)
  })

  it('gère une liste absente', () => {
    expect(formatChoiceOptions(undefined)).toBe('')
  })
})

describe('validateClientAnswer', () => {
  it('exige une valeur non vide', () => {
    expect(validateClientAnswer('text', '   ')).toBe('Cette information est requise.')
  })

  it('valide les emails', () => {
    expect(validateClientAnswer('email', 'contact@exemple.fr')).toBeNull()
    expect(validateClientAnswer('email', 'contact@exemple')).toBe('Adresse email invalide.')
    expect(validateClientAnswer('email', 'contact exemple.fr')).toBe('Adresse email invalide.')
  })

  it('valide les téléphones FR et internationaux', () => {
    expect(validateClientAnswer('phone', '06 12 34 56 78')).toBeNull()
    expect(validateClientAnswer('phone', '+33 6 12 34 56 78')).toBeNull()
    expect(validateClientAnswer('phone', '12345')).toBe('Numéro de téléphone invalide.')
  })

  it('valide les liens', () => {
    expect(validateClientAnswer('url', 'exemple.fr')).toBeNull()
    expect(validateClientAnswer('url', 'pas une url')).toBe('Lien invalide (ex. https://exemple.fr).')
  })

  it('impose une option proposée pour un choix', () => {
    const config = { choiceOptions: ['Oui', 'Non'] }
    expect(validateClientAnswer('choice', 'Oui', config)).toBeNull()
    expect(validateClientAnswer('choice', 'Peut-être', config)).toBe(
      'Sélectionnez une option proposée.',
    )
  })

  it('signale une liste de choix vide', () => {
    expect(validateClientAnswer('choice', 'Oui', { choiceOptions: [] })).toBe(
      'Aucune option disponible.',
    )
  })

  it('ne valide pas les types non saisis', () => {
    expect(validateClientAnswer('file', '')).toBeNull()
    expect(validateClientAnswer('payment', '')).toBeNull()
    expect(validateClientAnswer('signature', '')).toBeNull()
  })
})

describe('normalizeClientAnswer', () => {
  it('complète le schéma des URLs', () => {
    expect(normalizeClientAnswer('url', 'exemple.fr')).toBe('https://exemple.fr')
  })

  it('nettoie les espaces des autres champs', () => {
    expect(normalizeClientAnswer('text', '  bonjour  ')).toBe('bonjour')
  })
})

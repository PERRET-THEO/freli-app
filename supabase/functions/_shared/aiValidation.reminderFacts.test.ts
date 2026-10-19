import { describe, expect, it } from 'vitest'
import {
  buildFallbackReminder,
  containsInappropriateTerms,
  noteAppearsVerbatim,
  sanitizeCorrectionNotes,
  validateReminderFacts,
} from './aiValidation.ts'

const baseFacts = {
  clientActionCount: 3,
  clientActionLabels: ['Charte UI', 'Logo', 'Contenus'],
  completedVisible: 2,
  totalVisible: 5,
  percent: 40,
}

describe('validateReminderFacts', () => {
  it('refuse « presque terminé / une seule action » si plusieurs actions restent', () => {
    const result = validateReminderFacts(
      'Votre parcours est presque terminé',
      'Il ne vous reste plus qu’une seule action à faire.',
      baseFacts,
    )
    expect(result.ok).toBe(false)
  })

  it('refuse « il ne vous reste que cette action » si plusieurs actions restent', () => {
    const result = validateReminderFacts(
      'Suite',
      'Il ne vous reste que cette action à accomplir.',
      baseFacts,
    )
    expect(result.ok).toBe(false)
  })

  it('accepte « une seule action » si clientActionCount === 1', () => {
    const result = validateReminderFacts(
      'Une dernière étape',
      'Il ne vous reste plus qu’une seule action : la Charte UI.',
      { ...baseFacts, clientActionCount: 1, clientActionLabels: ['Charte UI'] },
    )
    expect(result.ok).toBe(true)
  })

  it('refuse un avancement chiffré incohérent', () => {
    const result = validateReminderFacts('Suite', 'Vous en êtes à 4/5 (80 %).', baseFacts)
    expect(result.ok).toBe(false)
  })

  it('rejette une note de correction reprise mot pour mot', () => {
    const result = validateReminderFacts(
      'Ajustement',
      'Notre équipe a relevé un retour : « photo trop sombre ».',
      {
        ...baseFacts,
        clientActionCount: 1,
        clientActionLabels: ['Charte UI'],
        forbiddenVerbatimNotes: ['photo trop sombre'],
      },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/mot pour mot/i)
  })

  it('rejette un terme inapproprié dans le corps', () => {
    const result = validateReminderFacts(
      'Suite',
      'Merci de renvoyer votre fichier, ca va pas fdp.',
      { ...baseFacts, clientActionCount: 1, clientActionLabels: ['Charte UI'] },
    )
    expect(result.ok).toBe(false)
  })
})

describe('sanitizeCorrectionNotes', () => {
  it('note normale → conservée pour reformulation', () => {
    const rows = sanitizeCorrectionNotes([
      { label: 'Charte UI', note: 'Merci d’augmenter le contraste du logo.' },
    ])
    expect(rows[0].omittedAsInappropriate).toBe(false)
    expect(rows[0].noteForPrompt).toContain('contraste')
  })

  it('note injurieuse → absente du prompt (libellé seul)', () => {
    const rows = sanitizeCorrectionNotes([{ label: 'Charte UI', note: 'ca va pas fdp' }])
    expect(rows[0].omittedAsInappropriate).toBe(true)
    expect(rows[0].noteForPrompt).toBeNull()
  })
})

describe('containsInappropriateTerms / noteAppearsVerbatim', () => {
  it('détecte les termes de la liste', () => {
    expect(containsInappropriateTerms('ca va pas fdp')).toBe(true)
    expect(containsInappropriateTerms('Merci d’augmenter le contraste')).toBe(false)
  })

  it('détecte une citation verbatim', () => {
    expect(
      noteAppearsVerbatim(
        'Retour : « photo trop sombre » merci.',
        ['photo trop sombre'],
      ),
    ).toBe(true)
  })
})

describe('buildFallbackReminder', () => {
  it('produit un mail sans note brute', () => {
    const mail = buildFallbackReminder({
      firstName: 'Alice',
      agencyName: 'Studio',
      clientActionLabels: ['Charte UI'],
      correctionLabels: ['Charte UI'],
    })
    expect(mail.body).toContain('Charte UI')
    expect(mail.body.toLowerCase()).not.toContain('fdp')
  })
})

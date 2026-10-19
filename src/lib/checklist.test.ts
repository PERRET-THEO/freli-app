import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  buildChecklistItemConfig,
  createDraftItem,
  readChecklistItemConfig,
  validateChecklist,
  type DraftChecklistItem,
} from './checklist'

function textItem(label = 'Brief'): DraftChecklistItem {
  return createDraftItem(label, 'text')
}

describe('validateChecklist — étapes de paiement', () => {
  it('refuse deux étapes de paiement', () => {
    const items = [createDraftItem('Acompte', 'payment'), createDraftItem('Solde', 'payment')]
    expect(validateChecklist(items, { priceEur: 500 })).toBe(
      'Une seule étape de paiement par projet.',
    )
  })

  it('exige un prix sur un projet', () => {
    const items = [createDraftItem('Acompte', 'payment')]
    expect(validateChecklist(items, { priceEur: null })).toBe(
      'Renseigne un prix pour utiliser une étape de paiement.',
    )
  })

  it('accepte une étape de paiement avec un prix', () => {
    const items = [createDraftItem('Acompte', 'payment')]
    expect(validateChecklist(items, { priceEur: 500 })).toBeNull()
  })

  it("n'exige pas de prix dans un modèle réutilisable", () => {
    const items = [createDraftItem('Acompte', 'payment')]
    expect(validateChecklist(items, { context: 'template' })).toBeNull()
  })
})

describe('validateChecklist — étapes de choix', () => {
  it('exige au moins deux options', () => {
    const items = [createDraftItem('Formule', 'choice', { choiceOptions: ['Standard'] })]
    expect(validateChecklist(items)).toBe(
      "L'item « Formule » doit proposer au moins deux options.",
    )
  })

  it('ignore les options vides dans le décompte', () => {
    const items = [
      createDraftItem('Formule', 'choice', { choiceOptions: ['Standard', '   ', ''] }),
    ]
    expect(validateChecklist(items)).toContain('au moins deux options')
  })

  it('accepte deux options valides', () => {
    const items = [
      createDraftItem('Formule', 'choice', { choiceOptions: ['Standard', 'Premium'] }),
    ]
    expect(validateChecklist(items)).toBeNull()
  })
})

describe('validateChecklist — étapes de rendez-vous', () => {
  it('exige un lien de réservation valide', () => {
    const items = [createDraftItem('Kickoff', 'schedule', { scheduleUrl: '' })]
    expect(validateChecklist(items)).toBe(
      "L'item « Kickoff » nécessite un lien de réservation valide.",
    )
  })

  it('accepte un lien sans schéma explicite', () => {
    const items = [
      createDraftItem('Kickoff', 'schedule', { scheduleUrl: 'calendly.com/agence/kickoff' }),
    ]
    expect(validateChecklist(items)).toBeNull()
  })

  it('refuse un lien portail Freli saisi par erreur', () => {
    const items = [
      createDraftItem('Kickoff', 'schedule', {
        scheduleUrl: 'http://localhost:5173/p/cfe4e261-7f24-41c9-8cdf-bc6bbd879436',
      }),
    ]
    expect(validateChecklist(items)).toMatch(/pas le lien du portail Freli/)
  })
})

describe('validateChecklist — règles existantes préservées', () => {
  it('refuse une checklist vide', () => {
    expect(validateChecklist([])).toBe('Ajoute au moins un item de checklist.')
  })

  it('exige un libellé sur chaque item', () => {
    expect(validateChecklist([textItem('   ')])).toBe('Chaque item doit avoir un libellé.')
  })

  it('accepte une checklist simple', () => {
    expect(validateChecklist([textItem(), createDraftItem('Logo', 'file')])).toBeNull()
  })
})

describe('buildChecklistItemConfig / readChecklistItemConfig', () => {
  it('sérialise les options de choix en nettoyant les vides', () => {
    const item = createDraftItem('Formule', 'choice', {
      choiceOptions: [' Standard ', '', 'Premium'],
    })
    expect(buildChecklistItemConfig(item)).toEqual({ choiceOptions: ['Standard', 'Premium'] })
  })

  it('normalise le lien de rendez-vous', () => {
    const item = createDraftItem('Kickoff', 'schedule', { scheduleUrl: 'calendly.com/a' })
    expect(buildChecklistItemConfig(item)).toEqual({ scheduleUrl: 'https://calendly.com/a' })
  })

  it("ne produit pas de config pour les types qui n'en ont pas", () => {
    expect(buildChecklistItemConfig(textItem())).toBeNull()
    expect(buildChecklistItemConfig(createDraftItem('Acompte', 'payment'))).toBeNull()
  })

  it('sérialise eraseSecretOnApprove pour credentials', () => {
    const item = createDraftItem('Accès', 'credentials', { eraseSecretOnApprove: true })
    expect(buildChecklistItemConfig(item)).toEqual({ eraseSecretOnApprove: true })
    expect(readChecklistItemConfig('credentials', { eraseSecretOnApprove: true })).toEqual({
      eraseSecretOnApprove: true,
    })
  })

  it('sérialise le placeholder optionnel', () => {
    const item = createDraftItem('Brief', 'text', {
      placeholder: 'Décrivez votre projet, vos objectifs…',
    })
    expect(buildChecklistItemConfig(item)).toEqual({
      placeholder: 'Décrivez votre projet, vos objectifs…',
    })
    expect(
      readChecklistItemConfig('text', {
        placeholder: 'Décrivez votre projet, vos objectifs…',
      }),
    ).toEqual({ placeholder: 'Décrivez votre projet, vos objectifs…' })
  })

  it('relit la config vers les champs de brouillon', () => {
    expect(readChecklistItemConfig('choice', { choiceOptions: ['A', 'B'] })).toEqual({
      choiceOptions: ['A', 'B'],
    })
    expect(readChecklistItemConfig('schedule', { scheduleUrl: 'https://x.fr' })).toEqual({
      scheduleUrl: 'https://x.fr',
    })
    expect(readChecklistItemConfig('text', null)).toEqual({})
  })

  it('tolère une config absente', () => {
    expect(readChecklistItemConfig('choice', null)).toEqual({ choiceOptions: [] })
    expect(readChecklistItemConfig('schedule', null)).toEqual({ scheduleUrl: '' })
  })
})

describe('builtins credentials', () => {
  it('convertit Accès hébergeur, Accès plateforme et Comptes stores', () => {
    const labels = [
      ...BUILTIN_TEMPLATES.website.items,
      ...BUILTIN_TEMPLATES.ecommerce.items,
      ...BUILTIN_TEMPLATES.mobile.items,
    ]
      .filter((item) =>
        ['Accès hébergeur', 'Accès plateforme (Shopify, etc.)', 'Comptes stores'].includes(
          item.label,
        ),
      )
      .map((item) => item.type)
    expect(labels).toEqual(['credentials', 'credentials', 'credentials'])
  })
})

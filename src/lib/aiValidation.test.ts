import { describe, expect, it } from 'vitest'
import {
  heuristicFieldConfidence,
  parseContractDraft,
  parseExtractionFields,
  parseReminderPayload,
} from '../../supabase/functions/_shared/aiValidation.ts'

describe('aiValidation', () => {
  it('parse extraction kbis fields', () => {
    const result = parseExtractionFields('kbis', {
      company_name: 'Acme',
      legal_form: 'SAS',
      siren: '732829320',
      siret: null,
      rcs_city: 'Paris',
      registered_address: '1 rue Test',
      creation_date: null,
      share_capital: '1000',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.fields.company_name).toBe('Acme')
  })

  it('rejette un type inconnu', () => {
    expect(parseExtractionFields('passport', {}).ok).toBe(false)
  })

  it('parse reminder payload', () => {
    const result = parseReminderPayload({
      subject: 'Votre espace est prêt',
      body: 'Bonjour, il reste une étape simple à finaliser pour démarrer. À bientôt.',
    })
    expect(result.ok).toBe(true)
  })

  it('parse contract draft with library origin', () => {
    const result = parseContractDraft({
      title: 'Contrat',
      sections: [
        {
          heading: 'Confidentialité',
          content: 'Les parties s’engagent…',
          origin: 'library',
          needs_legal_review: false,
        },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sections[0].origin).toBe('library')
  })

  it('heuristic confidence', () => {
    expect(heuristicFieldConfidence({ a: 'x', b: null }).a).toBe(0.85)
    expect(heuristicFieldConfidence({ a: 'x', b: null }).b).toBe(0)
  })
})

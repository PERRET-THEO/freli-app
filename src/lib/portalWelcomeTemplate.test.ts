import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTAL_WELCOME,
  insertWelcomeVariable,
  renderPortalWelcome,
} from './portalWelcomeTemplate'

describe('portalWelcomeTemplate', () => {
  it('renders variables and empty fallbacks', () => {
    expect(
      renderPortalWelcome('Bonjour {{client.prenom}} — {{projet.nom}}', {
        'client.prenom': 'Alice',
        'projet.nom': 'Site',
      }),
    ).toBe('Bonjour Alice — Site')

    expect(
      renderPortalWelcome('Bonjour {{client.prenom}}!', {
        'client.prenom': null,
      }),
    ).toBe('Bonjour !')
  })

  it('uses default when template empty', () => {
    expect(renderPortalWelcome('', {})).toBe(DEFAULT_PORTAL_WELCOME)
  })

  it('inserts token at cursor', () => {
    expect(insertWelcomeVariable('Hello ', '{{agence.nom}}')).toBe('Hello {{agence.nom}}')
    expect(insertWelcomeVariable('AB', '{{x}}', 1)).toBe('A{{x}}B')
  })
})

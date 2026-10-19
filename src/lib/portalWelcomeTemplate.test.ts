import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTAL_WELCOME,
  insertWelcomeVariable,
  renderPortalWelcome,
  renderPortalWelcomeHtml,
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
    ).toBe('Bonjour\u202F!')
  })

  it('uses pipe fallback when value empty', () => {
    expect(
      renderPortalWelcome('Chez {{client.entreprise|votre entreprise}}', {
        'client.entreprise': '',
      }),
    ).toBe('Chez votre entreprise')
  })

  it('preserves internal newlines', () => {
    expect(
      renderPortalWelcome('Ligne 1\n\nBonjour {{client.prenom}}', {
        'client.prenom': 'Alice',
      }),
    ).toBe('Ligne 1\n\nBonjour Alice')
  })

  it('uses default when template empty', () => {
    expect(renderPortalWelcome('', {})).toBe(DEFAULT_PORTAL_WELCOME)
  })

  it('inserts token at cursor', () => {
    expect(insertWelcomeVariable('Hello ', '{{agence.nom}}')).toBe('Hello {{agence.nom}}')
    expect(insertWelcomeVariable('AB', '{{x}}', 1)).toBe('A{{x}}B')
  })

  it('escapes HTML values for email and converts newlines', () => {
    const html = renderPortalWelcomeHtml(
      'Entreprise : {{client.entreprise}}\nSuite',
      { 'client.entreprise': 'Acme <b>Corp</b>' },
    )
    expect(html).toContain('Acme &lt;b&gt;Corp&lt;/b&gt;')
    expect(html).not.toContain('<b>')
    expect(html).toContain('<br>')
  })

  it('conserve l’espace avant ? ! : ; (NNBSP) et ne touche pas « bien ? »', () => {
    expect(renderPortalWelcome('tourne bien ?', {})).toBe('tourne bien\u202F?')
    expect(renderPortalWelcome('Attention : suite', {})).toBe('Attention\u202F: suite')
  })

  it('compacte le double espace d’une variable vide avant ! sans coller le mot', () => {
    expect(
      renderPortalWelcome('{{client.entreprise}} !', {
        'client.entreprise': '',
      }),
    ).toBe('!')

    expect(
      renderPortalWelcome('tourne {{client.entreprise}} !', {
        'client.entreprise': null,
      }),
    ).toBe('tourne\u202F!')
  })

  it('retire seulement l’espace devant . et ,', () => {
    expect(
      renderPortalWelcome('Fin {{client.prenom}} .', {
        'client.prenom': '',
      }),
    ).toBe('Fin.')
  })
})

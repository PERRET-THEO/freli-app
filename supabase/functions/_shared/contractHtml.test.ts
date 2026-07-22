import { describe, expect, it } from 'vitest'
import { renderContractHtml } from './contractHtml.ts'
import type { AgencyLegalProfile } from './agencyLegal.ts'

const agency: AgencyLegalProfile = {
  name: 'Studio Créatif',
  legal_form: 'SARL',
  address_street: '10 avenue Victor Hugo',
  address_postal_code: '69002',
  address_city: 'Lyon',
  siret: '98765432100011',
  brand_color: '#ff00ff',
  contact_email: 'contact@studio.fr',
  logo_url: 'https://example.com/logo.png',
}

describe('renderContractHtml', () => {
  it('produit un document HTML avec la structure letterhead / clauses / signatures', () => {
    const html = renderContractHtml(
      {
        title: 'Proposition — Refonte site',
        sections: [
          { heading: 'Objet', content: 'Refonte du site vitrine.\n\n- Design\n- Développement' },
          { heading: 'Tarif et conditions financières', content: 'Le montant total est fixé à 8 000 € HT (huit mille euros).\n\nCe tarif comprend\n- Design\n- Développement\n\nCe tarif ne comprend pas\n- Hébergement' },
        ],
      },
      agency,
      { name: 'Société Dupont', email: 'contact@dupont.fr' },
      { showDraftNotice: true },
    )

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('class="letterhead"')
    expect(html).toContain('class="info-grid"')
    expect(html).toContain('class="clause"')
    expect(html).toContain('class="intro-line"')
    expect(html).toContain('class="signature-box"')
    expect(html).toContain('price-highlight')
    expect(html).toContain('id="client-signature-zone"')
    expect(html).toContain('ai-generated-notice')
    expect(html).toContain('Société Dupont')
    expect(html).toContain('<ul>')
    expect(html).not.toContain('<script>')
    // Couleur magenta adoucie (pas le rose fluo brut)
    expect(html).not.toContain('--accent: #ff00ff')
  })

  it('masque le bandeau brouillon pour le PDF final', () => {
    const html = renderContractHtml(
      { title: 'Contrat', sections: [{ heading: 'Objet', content: 'Test' }] },
      agency,
      null,
      { showDraftNotice: false },
    )
    expect(html).not.toContain('<div class="ai-generated-notice">')
  })

  it('échappe le contenu injecté', () => {
    const html = renderContractHtml(
      {
        title: 'Test <img onerror=alert(1)>',
        sections: [{ heading: 'Section', content: '<b>danger</b>' }],
      },
      agency,
      null,
    )
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img onerror=alert(1)&gt;')
    expect(html).toContain('&lt;b&gt;danger&lt;/b&gt;')
  })
})

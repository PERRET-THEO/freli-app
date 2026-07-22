import { describe, expect, it } from 'vitest'
import {
  buildLayoutCssOverrides,
  escapeHtml,
  extractHtAmount,
  formatContentAsHtml,
  renderChecklist,
  layoutProfileFromStructureSummary,
  prepareContractData,
} from './contractDocument.ts'
import type { AgencyLegalProfile } from './agencyLegal.ts'

const agency: AgencyLegalProfile = {
  name: 'Agence Test',
  legal_form: 'SAS',
  address_street: '1 rue de Paris',
  address_postal_code: '75001',
  address_city: 'Paris',
  siret: '12345678900012',
  brand_color: '#5b6ef5',
  logo_url: 'https://example.com/logo.png',
}

describe('escapeHtml', () => {
  it('échappe les caractères HTML dangereux', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
  })
})

describe('formatContentAsHtml', () => {
  it('convertit les paragraphes', () => {
    expect(formatContentAsHtml('Premier paragraphe.\n\nDeuxième paragraphe.')).toContain('<p>')
    expect(formatContentAsHtml('Premier paragraphe.\n\nDeuxième paragraphe.')).toContain('Deuxième')
  })

  it('convertit les listes à puces', () => {
    const html = formatContentAsHtml('- Premier point\n- Deuxième point')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>Premier point</li>')
    expect(html).toContain('<li>Deuxième point</li>')
  })

  it('convertit les listes numérotées', () => {
    const html = formatContentAsHtml('1. Objet\n2. Durée')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>Objet</li>')
  })
})

describe('prepareContractData', () => {
  it('route les sections meta, ignore DE/POUR et garde le corps', () => {
    const data = prepareContractData(
      {
        title: 'Proposition commerciale',
        sections: [
          { heading: 'Date', content: '09/07/2026' },
          { heading: 'DE', content: 'ignoré' },
          { heading: 'Objet', content: 'Création de site web' },
          { heading: 'POUR', content: 'ignoré aussi' },
        ],
      },
      agency,
      { name: 'Client ACME' },
    )

    expect(data.title).toBe('Proposition commerciale')
    expect(data.metaItems).toHaveLength(1)
    expect(data.metaItems[0].label).toBe('Date')
    expect(data.bodySections).toHaveLength(1)
    expect(data.bodySections[0].heading).toBe('Objet')
    expect(data.deLines[0]).toBe('Agence Test')
    expect(data.pourLines[0]).toBe('Client ACME')
  })

  it('ajoute des meta par défaut si absentes', () => {
    const data = prepareContractData(
      { title: 'Contrat', sections: [{ heading: 'Tarif', content: '5000 €' }] },
      agency,
      null,
    )
    expect(data.metaItems).toHaveLength(3)
    expect(data.metaItems.map((m) => m.label)).toEqual(['Date', 'Validité', 'Référence'])
  })
})

describe('layoutProfileFromStructureSummary', () => {
  it('retourne null sans layout_hints', () => {
    expect(layoutProfileFromStructureSummary({ document_kind: 'contrat' })).toBeNull()
  })

  it('mappe les hints OCR vers un profil CSS', () => {
    expect(
      layoutProfileFromStructureSummary({
        layout_hints: { title_style: 'uppercase', numbered_sections: true },
        typography: { accent_muted: true },
      }),
    ).toEqual({
      section_heading_style: 'uppercase',
      numbered_sections: true,
      compact_spacing: false,
      accent_muted: true,
    })
  })
})

describe('extractHtAmount', () => {
  it('extrait un montant HT', () => {
    expect(extractHtAmount('Forfait : 8 000 € HT (huit mille euros)'))?.toMatchObject({
      amount: '8 000',
      label: 'huit mille euros',
    })
  })
})

describe('renderChecklist', () => {
  it('génère une liste avec coches', () => {
    const html = renderChecklist(['Design', 'Dev'], 'included')
    expect(html).toContain('checklist included')
    expect(html).toContain('✓')
    expect(html).toContain('Design')
  })
})

describe('buildLayoutCssOverrides', () => {
  it('génère des règles CSS pour titres majuscules', () => {
    const css = buildLayoutCssOverrides({ section_heading_style: 'uppercase' })
    expect(css).toContain('h2.section-title')
  })
})

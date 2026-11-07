// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { computeTotals } from './salesDocuments'
import {
  buildSalesDocumentPdf,
  pdfInputFromDocument,
  sanitizePdfText,
  type SalesPdfInput,
  type SalesPdfLine,
} from './salesDocumentPdf'

async function extractText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
  }
  return pages
}

const lines: SalesPdfLine[] = [
  { description: 'Création du site vitrine (5 pages)', quantity: 1, unit: 'forfait', unit_price_ht: 2400, vat_rate: 20, discount_percent: 0 },
  { description: 'Formation à l’outil — équipe', quantity: 2, unit: 'h', unit_price_ht: 199.99, vat_rate: 10, discount_percent: 10 },
]

function makeInput(over: Partial<SalesPdfInput> = {}): SalesPdfInput {
  const l = over.lines ?? lines
  return {
    kind: 'invoice',
    number: 'FAC-2026-0007',
    isDraft: false,
    title: 'Refonte du site — phase 1',
    issueDate: '2026-11-01',
    validUntil: null,
    dueDate: '2026-12-01',
    serviceDate: 'Octobre 2026',
    notes: 'Merci pour votre confiance.',
    paymentTerms: 'Paiement à 30 jours par virement.',
    vatExempt: false,
    vatExemptionReason: null,
    issuer: {
      name: 'Studio Alpha',
      legal_form: 'SASU',
      address_street: '1 rue de la Paix',
      address_postal_code: '42000',
      address_city: 'Saint-Étienne',
      siret: '12345678900011',
      vat_number: 'FR12345678900',
      share_capital: '1 000 €',
      rcs_city: 'Saint-Étienne',
    },
    client: {
      company_name: 'Durand SARL',
      first_name: 'Marie',
      last_name: 'Durand',
      email: 'marie@ex.fr',
      address_street: '5 avenue Foch',
      address_postal_code: '69006',
      address_city: 'Lyon',
      siret: '98765432100022',
    },
    lines: l,
    totals: computeTotals(l, over.vatExempt ?? false),
    sourceNumber: 'DEV-2026-0003',
    iban: 'FR76 3000 6000 0112 3456 7890 189',
    bic: 'AGRIFRPP',
    paymentInstructions: null,
    latePenaltyRate: null,
    footerNote: null,
    brandColor: '#5b6ef5',
    ...over,
  }
}

describe('PDF devis / facture', () => {
  it('génère une facture lisible avec toutes les mentions', async () => {
    const bytes = await buildSalesDocumentPdf(makeInput())
    expect(bytes.byteLength).toBeGreaterThan(1500)
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
    expect(loaded.getTitle()).toBe('Facture FAC-2026-0007')
    const [text] = await extractText(bytes)
    for (const expected of [
      'FACTURE',
      'FAC-2026-0007',
      'Studio Alpha',
      'Durand SARL',
      'Marie Durand',
      'SIRET : 12345678900011',
      'Création du site vitrine',
      'Remise 10 %',
      '2 400,00 €',
      '359,98 €',
      'Total HT',
      '2 759,98 €',
      'TVA 20 %',
      'Total TTC',
      '3 275,98 €',
      'ÉCHÉANCE',
      'MONTANT DÛ',
      '01/12/2026',
      'DEV-2026-0003',
      'IBAN',
      '40 €',
      "Pas d'escompte",
      'Page 1/1',
    ]) {
      expect(text.replace(/\s+/g, ' ')).toContain(expected)
    }
  })

  it('génère un devis avec bon pour accord et validité', async () => {
    const bytes = await buildSalesDocumentPdf(
      makeInput({ kind: 'quote', number: 'DEV-2026-0001', validUntil: '2026-12-15', dueDate: null, sourceNumber: null }),
    )
    const [text] = await extractText(bytes)
    expect(text).toContain('DEVIS')
    expect(text).toContain('Bon pour accord')
    expect(text.replace(/\s+/g, ' ')).toContain("valable jusqu'au 15/12/2026")
    expect(text).not.toContain('IBAN')
    expect(text).not.toContain('40 €')
  })

  it('génère un avoir référant la facture', async () => {
    const bytes = await buildSalesDocumentPdf(makeInput({ kind: 'credit_note', number: 'AV-2026-0001', sourceNumber: 'FAC-2026-0007' }))
    const [text] = await extractText(bytes)
    expect(text).toContain('AVOIR')
    expect(text).toContain('Montant de l’avoir TTC')
    expect(text).toContain('FAC-2026-0007')
  })

  it('marque les brouillons et ne les numérote pas', async () => {
    const bytes = await buildSalesDocumentPdf(makeInput({ isDraft: true, number: null }))
    const [text] = await extractText(bytes)
    expect(text).toContain('BROUILLON')
    expect(text).toContain('non numéroté')
    expect(text).toContain('À la finalisation')
  })

  it('franchise de TVA : mention et pas de colonne TVA', async () => {
    const bytes = await buildSalesDocumentPdf(makeInput({ vatExempt: true, vatExemptionReason: 'TVA non applicable, art. 293 B du CGI' }))
    const [text] = await extractText(bytes)
    expect(text).toContain('art. 293 B du CGI')
    expect(text).toContain('Total net à payer')
    expect(text.replace(/\s+/g, ' ')).toContain('2 759,98 €')
  })

  it('pagine les longues factures et répète l’en-tête du tableau', async () => {
    const many: SalesPdfLine[] = Array.from({ length: 60 }, (_, i) => ({
      description: `Ligne ${i + 1} — ${'description détaillée '.repeat(i % 3 === 0 ? 8 : 1)}`,
      quantity: 1,
      unit: null,
      unit_price_ht: 10,
      vat_rate: 20,
      discount_percent: 0,
    }))
    const bytes = await buildSalesDocumentPdf(makeInput({ lines: many }))
    const pages = await extractText(bytes)
    expect(pages.length).toBeGreaterThan(2)
    pages.forEach((p, i) => {
      expect(p).toContain(`Page ${i + 1}/${pages.length}`)
    })
    expect(pages.slice(1).every((p) => p.includes('DÉSIGNATION') || p.includes('Total TTC'))).toBe(true)
    expect(pages.join(' ')).toContain('Ligne 60')
    expect(pages.join(' ').replace(/\s+/g, ' ')).toContain('720,00 €')
  })

  it('intègre le logo PNG et ignore un logo invalide', async () => {
    // PNG 1×1 transparent
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const withLogo = await buildSalesDocumentPdf(makeInput({ logoPng: png }))
    const without = await buildSalesDocumentPdf(makeInput())
    expect(withLogo.byteLength).toBeGreaterThan(without.byteLength)
    const broken = await buildSalesDocumentPdf(makeInput({ logoPng: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) }))
    const [text] = await extractText(broken)
    expect(text).toContain('Studio Alpha')
  })

  it('un devis standard tient sur une seule page', async () => {
    const bytes = await buildSalesDocumentPdf(
      makeInput({ kind: 'quote', number: 'DEV-2026-0001', validUntil: '2026-12-15', dueDate: null, sourceNumber: null }),
    )
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
  })

  it('affiche « EI » pour un micro-entrepreneur', async () => {
    const base = makeInput()
    const bytes = await buildSalesDocumentPdf(makeInput({ issuer: { ...base.issuer, legal_form: 'Auto-entrepreneur' } }))
    const [text] = await extractText(bytes)
    expect(text).toContain('Studio Alpha (EI)')
    expect(text).not.toContain('Auto-entrepreneur')
  })

  it('remplace les caractères non encodables (emoji, espaces fines)', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    expect(sanitizePdfText(font, '1\u202f234,00\u00a0€ 🚀 œ’')).toBe('1 234,00 € ? œ’')
    const bytes = await buildSalesDocumentPdf(makeInput({ title: 'Projet 🚀 spécial', lines: [{ ...lines[0], description: 'Logo ✨ + charte' }] }))
    const [text] = await extractText(bytes)
    expect(text).toContain('Projet ? spécial')
  })

  it('utilise les instantanés pour un document finalisé et les données courantes pour un brouillon', () => {
    const common = {
      lines,
      totals: computeTotals(lines, false),
      sourceNumber: null,
      currentIssuer: { name: 'Nouveau nom' },
      currentClient: { company_name: 'Client actuel' },
      settings: { iban: 'IBAN-ACTUEL', bic: null, payment_instructions: null, late_penalty_rate: null, footer_note: null },
    }
    const docBase = {
      kind: 'invoice' as const,
      number: 'FAC-2026-0001',
      title: null,
      issue_date: '2026-11-01',
      valid_until: null,
      due_date: '2026-12-01',
      service_date: null,
      notes: null,
      payment_terms: null,
      vat_exempt: false,
      vat_exemption_reason: null,
      issuer_snapshot: { name: 'Ancien nom', iban: 'IBAN-FIGÉ' },
      client_snapshot: { company_name: 'Client figé' },
    }
    const finalized = pdfInputFromDocument({ ...common, document: { ...docBase, status: 'sent' } })
    expect(finalized.issuer.name).toBe('Ancien nom')
    expect(finalized.client?.company_name).toBe('Client figé')
    expect(finalized.iban).toBe('IBAN-FIGÉ')
    expect(finalized.isDraft).toBe(false)
    const draft = pdfInputFromDocument({ ...common, document: { ...docBase, status: 'draft', number: null } })
    expect(draft.issuer.name).toBe('Nouveau nom')
    expect(draft.client?.company_name).toBe('Client actuel')
    expect(draft.iban).toBe('IBAN-ACTUEL')
    expect(draft.isDraft).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  addDaysIso,
  availableActions,
  buildLegalMentions,
  buildMailtoLink,
  clientDisplayName,
  computeKpis,
  computeTotals,
  displayStatus,
  documentFileName,
  documentHeading,
  emptyLine,
  formatDateFr,
  formatMoney,
  isBusinessParty,
  legalFormForDocuments,
  suggestsVatExemption,
  lineTotalHt,
  parseDecimalInput,
  roundCents,
  salesStatusLabel,
  statusFiltersFor,
  validateForFinalize,
  validateLine,
  type DraftLineInput,
} from './salesDocuments'

const line = (over: Partial<DraftLineInput> = {}): DraftLineInput => ({
  id: 'l',
  description: 'Prestation',
  quantity: 1,
  unit: null,
  unit_price_ht: 100,
  vat_rate: 20,
  discount_percent: 0,
  ...over,
})

describe('calculs — parité avec le trigger SQL', () => {
  it('reproduit le cas multi-taux testé en base', () => {
    const totals = computeTotals(
      [
        line({ quantity: 3, unit_price_ht: 450, vat_rate: 20 }),
        line({ quantity: 2, unit_price_ht: 199.99, vat_rate: 10, discount_percent: 10 }),
        line({ quantity: 1, unit_price_ht: 25, vat_rate: 5.5 }),
      ],
      false,
    )
    expect(totals.subtotalHt).toBe(1734.98)
    expect(totals.totalVat).toBe(307.38)
    expect(totals.totalTtc).toBe(2042.36)
    expect(totals.breakdown.map((b) => b.rate)).toEqual([20, 10, 5.5])
    expect(totals.breakdown[1]).toEqual({ rate: 10, base: 359.98, vat: 36 })
  })

  it('arrondit les lignes au centime (demi vers le haut)', () => {
    expect(lineTotalHt({ quantity: 0.5, unit_price_ht: 0.01, discount_percent: 0 })).toBe(0.01)
    expect(lineTotalHt({ quantity: 3, unit_price_ht: 0.335, discount_percent: 0 })).toBe(1.02)
    expect(lineTotalHt({ quantity: 1.333, unit_price_ht: 75, discount_percent: 0 })).toBe(99.98)
    expect(lineTotalHt({ quantity: 1, unit_price_ht: 99.99, discount_percent: 33.33 })).toBe(66.66)
    expect(lineTotalHt({ quantity: 2, unit_price_ht: 50, discount_percent: 100 })).toBe(0)
  })

  it('évite les erreurs de virgule flottante classiques', () => {
    const totals = computeTotals(
      [line({ unit_price_ht: 0.1 }), line({ unit_price_ht: 0.2 })],
      false,
    )
    expect(totals.subtotalHt).toBe(0.3)
    expect(totals.totalVat).toBe(0.06)
    expect(totals.totalTtc).toBe(0.36)
    expect(roundCents(1.005)).toBe(1.01)
    expect(roundCents(2.675)).toBe(2.68)
  })

  it('calcule la TVA par taux (et non par ligne)', () => {
    // 3 lignes à 0,05 € HT, 20 % : par ligne 0,01×3 = 0,03 ; par taux round(0,15×0,2)=0,03
    // 3 lignes à 0,03 € HT, 20 % : par ligne 0,01×3 = 0,03 ; par taux round(0,09×0,2)=0,02
    const totals = computeTotals(
      [line({ unit_price_ht: 0.03 }), line({ unit_price_ht: 0.03 }), line({ unit_price_ht: 0.03 })],
      false,
    )
    expect(totals.totalVat).toBe(0.02)
  })

  it('applique 0 % quand la TVA est non applicable', () => {
    const totals = computeTotals([line({ vat_rate: 20 }), line({ vat_rate: 10 })], true)
    expect(totals.totalVat).toBe(0)
    expect(totals.totalTtc).toBe(200)
    expect(totals.breakdown).toEqual([{ rate: 0, base: 200, vat: 0 }])
  })

  it('gère le taux 2,1 % et les gros montants', () => {
    const totals = computeTotals([line({ quantity: 1000, unit_price_ht: 9999.99, vat_rate: 2.1 })], false)
    expect(totals.subtotalHt).toBe(9999990)
    expect(totals.totalVat).toBe(209999.79)
  })

  it('renvoie zéro sans ligne', () => {
    expect(computeTotals([], false)).toEqual({ subtotalHt: 0, totalVat: 0, totalTtc: 0, breakdown: [] })
  })
})

describe('statuts', () => {
  it('dérive « expiré » et « en retard »', () => {
    expect(displayStatus({ kind: 'quote', status: 'sent', valid_until: '2026-01-01', due_date: null }, '2026-02-01')).toBe('expired')
    expect(displayStatus({ kind: 'quote', status: 'sent', valid_until: '2026-03-01', due_date: null }, '2026-02-01')).toBe('sent')
    expect(displayStatus({ kind: 'quote', status: 'accepted', valid_until: '2026-01-01', due_date: null }, '2026-02-01')).toBe('accepted')
    expect(displayStatus({ kind: 'invoice', status: 'sent', valid_until: null, due_date: '2026-01-31' }, '2026-02-01')).toBe('overdue')
    expect(displayStatus({ kind: 'invoice', status: 'sent', valid_until: null, due_date: '2026-02-01' }, '2026-02-01')).toBe('sent')
    expect(displayStatus({ kind: 'invoice', status: 'paid', valid_until: null, due_date: '2026-01-01' }, '2026-02-01')).toBe('paid')
  })

  it('a des libellés français par type', () => {
    expect(salesStatusLabel('quote', 'sent')).toBe('En attente')
    expect(salesStatusLabel('invoice', 'sent')).toBe('À encaisser')
    expect(salesStatusLabel('invoice', 'overdue')).toBe('En retard')
    expect(salesStatusLabel('invoice', 'paid')).toBe('Payée')
    expect(salesStatusLabel('credit_note', 'sent')).toBe('Émis')
    expect(statusFiltersFor('invoice')).toContain('overdue')
    expect(statusFiltersFor('quote')).toContain('expired')
  })
})

describe('actions disponibles', () => {
  it('brouillon : enregistrer / finaliser / supprimer', () => {
    expect(availableActions({ kind: 'invoice', status: 'draft', converted_invoice_id: null, source_document_id: null })).toEqual(['save', 'finalize', 'pdf', 'delete'])
  })
  it('devis envoyé / accepté / converti / refusé', () => {
    const sent = availableActions({ kind: 'quote', status: 'sent', converted_invoice_id: null, source_document_id: null })
    expect(sent).toEqual(expect.arrayContaining(['mark_accepted', 'mark_declined', 'convert', 'delete']))
    const accepted = availableActions({ kind: 'quote', status: 'accepted', converted_invoice_id: null, source_document_id: null })
    expect(accepted).toEqual(expect.arrayContaining(['convert', 'reopen']))
    const converted = availableActions({ kind: 'quote', status: 'accepted', converted_invoice_id: 'x', source_document_id: null })
    expect(converted).toContain('open_invoice')
    expect(converted).not.toContain('convert')
    expect(converted).not.toContain('reopen')
    expect(availableActions({ kind: 'quote', status: 'declined', converted_invoice_id: null, source_document_id: null })).toContain('reopen')
  })
  it('facture : jamais supprimable une fois émise', () => {
    for (const status of ['sent', 'paid', 'cancelled'] as const) {
      expect(availableActions({ kind: 'invoice', status, converted_invoice_id: null, source_document_id: null })).not.toContain('delete')
    }
    expect(availableActions({ kind: 'invoice', status: 'sent', converted_invoice_id: null, source_document_id: null })).toContain('mark_paid')
    expect(availableActions({ kind: 'invoice', status: 'paid', converted_invoice_id: null, source_document_id: null })).toContain('unmark_paid')
    expect(availableActions({ kind: 'invoice', status: 'sent', converted_invoice_id: null, source_document_id: null }, { hasCreditNote: true })).toContain('open_credit_note')
    expect(availableActions({ kind: 'invoice', status: 'cancelled', converted_invoice_id: null, source_document_id: null })).not.toContain('credit_note')
  })
  it('avoir : lien vers la facture d’origine', () => {
    expect(availableActions({ kind: 'credit_note', status: 'sent', converted_invoice_id: null, source_document_id: 'i' })).toContain('open_source')
  })
})

describe('mentions légales', () => {
  const base = {
    vatExempt: false,
    vatExemptionReason: null,
    dueDate: '2026-12-01',
    validUntil: '2026-11-30',
    paymentTerms: 'Paiement à 30 jours par virement.',
    latePenaltyRate: null,
  }
  it('facture B2B : pénalités + indemnité 40 €', () => {
    const m = buildLegalMentions({ ...base, kind: 'invoice', clientIsBusiness: true })
    expect(m.join(' ')).toContain('40 €')
    expect(m.join(' ')).toContain("trois fois le taux d'intérêt légal")
    expect(m.join(' ')).toContain("Pas d'escompte")
    expect(m.join(' ')).toContain('01/12/2026')
  })
  it('facture particulier : pas d’indemnité forfaitaire', () => {
    const m = buildLegalMentions({ ...base, kind: 'invoice', clientIsBusiness: false })
    expect(m.join(' ')).not.toContain('40 €')
  })
  it('franchise en base de TVA', () => {
    const m = buildLegalMentions({ ...base, kind: 'invoice', vatExempt: true, clientIsBusiness: false })
    expect(m[0]).toBe('TVA non applicable, art. 293 B du CGI')
  })
  it('devis : date de validité', () => {
    const m = buildLegalMentions({ ...base, kind: 'quote', clientIsBusiness: true })
    expect(m.join(' ')).toContain("valable jusqu'au 30/11/2026")
    expect(m.join(' ')).not.toContain('40 €')
  })
  it('avoir : référence de la facture', () => {
    const m = buildLegalMentions({ ...base, kind: 'credit_note', clientIsBusiness: true, sourceNumber: 'FAC-2026-0004' })
    expect(m.join(' ')).toContain('FAC-2026-0004')
  })
  it('détecte un client professionnel', () => {
    expect(isBusinessParty({ company_name: 'ACME' })).toBe(true)
    expect(isBusinessParty({ siret: '123' })).toBe(true)
    expect(isBusinessParty({ first_name: 'Jean' })).toBe(false)
    expect(isBusinessParty(null)).toBe(false)
  })
})

describe('forme juridique', () => {
  it('affiche EI pour un micro-entrepreneur', () => {
    expect(legalFormForDocuments('Auto-entrepreneur')).toBe('EI')
    expect(legalFormForDocuments('micro-entreprise')).toBe('EI')
    expect(legalFormForDocuments('SASU')).toBe('SASU')
    expect(legalFormForDocuments('')).toBeNull()
  })
  it('propose la franchise de TVA sans n° de TVA', () => {
    expect(suggestsVatExemption({ legal_form: 'Auto-entrepreneur', vat_number: null })).toBe(true)
    expect(suggestsVatExemption({ legal_form: 'Auto-entrepreneur', vat_number: 'FR1' })).toBe(false)
    expect(suggestsVatExemption({ legal_form: 'SAS', vat_number: null })).toBe(false)
    expect(suggestsVatExemption(null)).toBe(false)
  })
})

describe('validation', () => {
  const issuer = {
    name: 'Studio',
    siret: '12345678900011',
    address_street: '1 rue',
    address_postal_code: '42000',
    address_city: 'Saint-Étienne',
    vat_number: 'FR00',
  }
  it('valide une ligne', () => {
    expect(validateLine(line())).toBeNull()
    expect(validateLine(line({ description: '  ' }))).toMatch(/Description/)
    expect(validateLine(line({ quantity: 0 }))).toMatch(/Quantité/)
    expect(validateLine(line({ unit_price_ht: -1 }))).toMatch(/Prix/)
    expect(validateLine(line({ vat_rate: 19.6 }))).toMatch(/TVA/)
    expect(validateLine(line({ discount_percent: 120 }))).toMatch(/Remise/)
    expect(validateLine(line({ quantity: Number.NaN }))).toMatch(/Quantité/)
  })
  it('bloque une facture sans client, sans ligne ou à zéro', () => {
    const issues = validateForFinalize({ kind: 'invoice', clientId: null, lines: [], vatExempt: false, issuer, totalTtc: 0 })
    expect(issues.filter((i) => i.blocking).map((i) => i.field)).toEqual(['client', 'lines'])
    const zero = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line({ unit_price_ht: 0 })], vatExempt: false, issuer, totalTtc: 0 })
    expect(zero.some((i) => i.field === 'total' && i.blocking)).toBe(true)
    const ok = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line()], vatExempt: false, issuer, totalTtc: 120 })
    expect(ok).toEqual([])
  })
  it('exige SIRET + adresse pour une facture, avertit seulement pour un devis', () => {
    const noLegal = { ...issuer, siret: null, address_street: null }
    const inv = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line()], vatExempt: false, issuer: noLegal, totalTtc: 120 })
    expect(inv.filter((i) => i.field === 'issuer' && i.blocking)).toHaveLength(2)
    const quote = validateForFinalize({ kind: 'quote', clientId: 'c', lines: [line()], vatExempt: false, issuer: noLegal, totalTtc: 120 })
    expect(quote.filter((i) => i.blocking)).toHaveLength(0)
    expect(quote.length).toBeGreaterThan(0)
  })
  it('avertit (sans bloquer) si l’adresse du client manque sur une facture', () => {
    const issues = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line()], vatExempt: false, issuer, totalTtc: 120, clientHasAddress: false })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ field: 'client', blocking: false })
    expect(validateForFinalize({ kind: 'quote', clientId: 'c', lines: [line()], vatExempt: false, issuer, totalTtc: 120, clientHasAddress: false })).toEqual([])
  })
  it('avertit si pas de n° TVA hors franchise', () => {
    const issues = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line()], vatExempt: false, issuer: { ...issuer, vat_number: null }, totalTtc: 120 })
    expect(issues).toHaveLength(1)
    expect(issues[0].blocking).toBe(false)
    const exempt = validateForFinalize({ kind: 'invoice', clientId: 'c', lines: [line()], vatExempt: true, issuer: { ...issuer, vat_number: null }, totalTtc: 120 })
    expect(exempt).toEqual([])
  })
})

describe('indicateurs', () => {
  it('calcule encaissé / à encaisser / retard / devis', () => {
    const k = computeKpis(
      [
        { kind: 'invoice', status: 'sent', total_ttc: 1200, due_date: '2026-12-31', valid_until: null, paid_at: null, issue_date: '2026-11-01' },
        { kind: 'invoice', status: 'sent', total_ttc: 300.1, due_date: '2026-10-01', valid_until: null, paid_at: null, issue_date: '2026-09-01' },
        { kind: 'invoice', status: 'paid', total_ttc: 500.2, due_date: '2026-10-01', valid_until: null, paid_at: '2026-10-02T10:00:00Z', issue_date: '2026-09-01' },
        { kind: 'invoice', status: 'paid', total_ttc: 999, due_date: null, valid_until: null, paid_at: '2025-12-02T10:00:00Z', issue_date: '2025-11-01' },
        { kind: 'invoice', status: 'draft', total_ttc: 50, due_date: null, valid_until: null, paid_at: null, issue_date: null },
        { kind: 'quote', status: 'sent', total_ttc: 800, due_date: null, valid_until: '2026-12-01', paid_at: null, issue_date: '2026-11-01' },
        { kind: 'quote', status: 'sent', total_ttc: 100, due_date: null, valid_until: '2026-10-01', paid_at: null, issue_date: '2026-09-01' },
        { kind: 'quote', status: 'accepted', total_ttc: 2000, due_date: null, valid_until: null, paid_at: null, issue_date: '2026-03-01' },
        { kind: 'quote', status: 'declined', total_ttc: 10, due_date: null, valid_until: null, paid_at: null, issue_date: '2026-03-01' },
        { kind: 'quote', status: 'accepted', total_ttc: 10, due_date: null, valid_until: null, paid_at: null, issue_date: '2026-03-01' },
      ],
      '2026-11-01',
    )
    expect(k.toCollect).toBe(1500.1)
    expect(k.toCollectCount).toBe(2)
    expect(k.overdue).toBe(300.1)
    expect(k.overdueCount).toBe(1)
    expect(k.paidThisYear).toBe(500.2)
    expect(k.pendingQuotes).toBe(800)
    expect(k.pendingQuotesCount).toBe(1)
    expect(k.acceptedQuotesThisYear).toBe(2010)
    expect(k.acceptanceRate).toBe(67)
  })
  it('taux d’acceptation nul sans décision', () => {
    expect(computeKpis([]).acceptanceRate).toBeNull()
  })
})

describe('formatage & utilitaires', () => {
  it('formate les montants et dates', () => {
    expect(formatMoney(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 €')
    expect(formatMoney(null)).toBe('—')
    expect(formatDateFr('2026-11-01')).toBe('01/11/2026')
    expect(formatDateFr('2026-11-01T23:30:00Z')).toBe('01/11/2026')
    expect(formatDateFr(null)).toBe('—')
    expect(addDaysIso('2026-12-15', 30)).toBe('2027-01-14')
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('parse les saisies françaises', () => {
    expect(parseDecimalInput('1 234,50')).toBe(1234.5)
    expect(parseDecimalInput('12.5')).toBe(12.5)
    expect(parseDecimalInput('20 %')).toBe(20)
    expect(parseDecimalInput('99 €')).toBe(99)
    expect(parseDecimalInput('')).toBeNaN()
    expect(parseDecimalInput('abc')).toBeNaN()
    expect(parseDecimalInput('1,2,3')).toBeNaN()
  })
  it('nomme clients et fichiers', () => {
    expect(clientDisplayName({ company_name: 'ACME', first_name: 'A', last_name: 'B' })).toBe('ACME')
    expect(clientDisplayName({ company_name: null, first_name: 'Marie', last_name: 'Durand' })).toBe('Marie Durand')
    expect(clientDisplayName({ company_name: null, first_name: 'théo', last_name: 'perret' })).toBe('Théo Perret')
    expect(clientDisplayName(null)).toBe('Client supprimé')
    expect(documentFileName({ kind: 'invoice', number: 'FAC-2026-0001' })).toBe('FAC-2026-0001.pdf')
    expect(documentFileName({ kind: 'quote', number: null })).toBe('DEV-brouillon.pdf')
    expect(documentHeading({ kind: 'credit_note', number: 'AV-2026-0001' })).toBe('Avoir AV-2026-0001')
    expect(documentHeading({ kind: 'quote', number: null })).toBe('Devis')
  })
  it('crée une ligne vide cohérente avec la franchise', () => {
    expect(emptyLine(20, false).vat_rate).toBe(20)
    expect(emptyLine(20, true).vat_rate).toBe(0)
    expect(emptyLine(10, false).id).not.toBe(emptyLine(10, false).id)
  })
  it('prépare un e-mail', () => {
    const link = buildMailtoLink({
      to: 'marie@ex.fr',
      kind: 'invoice',
      number: 'FAC-2026-0001',
      totalTtc: 1200,
      agencyName: 'Studio',
      dueDate: '2026-12-01',
    })
    expect(link.startsWith('mailto:marie%40ex.fr?subject=')).toBe(true)
    const body = decodeURIComponent(link.split('body=')[1])
    expect(body).toContain('la facture FAC-2026-0001')
    expect(body).toContain('1 200,00 € TTC')
    expect(body).toContain('01/12/2026')
  })
})

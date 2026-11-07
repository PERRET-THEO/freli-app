import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, type ReactNode } from 'react'
import type { SalesDocumentDetail } from '../lib/salesDocumentsApi'
import { addDaysIso, todayIso, type SalesDocument } from '../lib/salesDocuments'

vi.mock('../components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../contexts/AgencyContext', () => ({
  useAgencySession: () => ({ loading: false, agency: { id: 'ag-1', name: 'Studio', logo_url: null } }),
}))

const api = vi.hoisted(() => ({
  getInvoicingSettings: vi.fn(),
  getAgencyIssuer: vi.fn(),
  listClientOptions: vi.fn(),
  listProjectOptions: vi.fn(),
  getSalesDocument: vi.fn(),
  createSalesDocumentDraft: vi.fn(),
  updateSalesDocumentDraft: vi.fn(),
  saveSalesDocumentLines: vi.fn(),
  finalizeSalesDocument: vi.fn(),
  setSalesDocumentStatus: vi.fn(),
  convertQuoteToInvoice: vi.fn(),
  createCreditNote: vi.fn(),
  duplicateSalesDocument: vi.fn(),
  deleteSalesDocument: vi.fn(),
}))
vi.mock('../lib/salesDocumentsApi', () => api)

import { SalesDocumentEditor } from './SalesDocumentEditor'

const CLIENT = {
  id: 'cl-1',
  first_name: 'Marie',
  last_name: 'Durand',
  email: 'marie@ex.fr',
  phone: null,
  company_name: 'Durand SARL',
  siret: '98765432100022',
  siren: null,
  vat_number: null,
  address_street: '5 avenue Foch',
  address_postal_code: '69006',
  address_city: 'Lyon',
  address_country: 'France',
}

const ISSUER = {
  name: 'Studio',
  legal_form: 'SASU',
  address_street: '1 rue',
  address_postal_code: '42000',
  address_city: 'Saint-Étienne',
  siret: '12345678900011',
  siren: null,
  vat_number: 'FR123',
  share_capital: null,
  rcs_city: null,
  contact_email: null,
  contact_phone: null,
  brand_color: null,
}

function makeDoc(over: Partial<SalesDocument> = {}): SalesDocument {
  return {
    id: 'doc-1',
    agency_id: 'ag-1',
    kind: 'invoice',
    status: 'draft',
    client_id: 'cl-1',
    project_id: null,
    source_document_id: null,
    converted_invoice_id: null,
    number: null,
    title: 'Site vitrine',
    issue_date: null,
    valid_until: null,
    due_date: '2026-12-31',
    service_date: null,
    notes: null,
    payment_terms: null,
    vat_exempt: false,
    vat_exemption_reason: null,
    subtotal_ht: 1000,
    total_vat: 200,
    total_ttc: 1200,
    vat_breakdown: [{ rate: 20, base: 1000, vat: 200 }],
    issuer_snapshot: null,
    client_snapshot: null,
    finalized_at: null,
    accepted_at: null,
    declined_at: null,
    paid_at: null,
    cancelled_at: null,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    ...over,
  }
}

function detail(doc: SalesDocument, over: Partial<SalesDocumentDetail> = {}): SalesDocumentDetail {
  return {
    document: doc,
    lines: [
      { id: 'line-1', position: 0, description: 'Design', quantity: 2, unit: 'jour', unit_price_ht: 500, vat_rate: 20, discount_percent: 0 },
    ],
    creditNoteId: null,
    sourceNumber: null,
    convertedInvoiceNumber: null,
    ...over,
  }
}

const nav = { path: '' }
function LocationProbe() {
  const loc = useLocation()
  useEffect(() => {
    nav.path = loc.pathname + loc.search
  }, [loc])
  return null
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/dashboard/documents/nouveau" element={<SalesDocumentEditor />} />
        <Route path="/dashboard/documents/:id" element={<SalesDocumentEditor />} />
        <Route path="/dashboard/documents" element={<p>Liste</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const money = (el: HTMLElement) => el.textContent?.replace(/[\s\u202f\u00a0]/g, ' ')

beforeEach(() => {
  vi.clearAllMocks()
  api.getInvoicingSettings.mockResolvedValue({
    agency_id: 'ag-1',
    payment_terms_days: 30,
    quote_validity_days: 15,
    default_vat_rate: 20,
    vat_exempt: false,
    vat_exemption_reason: null,
    late_penalty_rate: "trois fois le taux d'intérêt légal",
    iban: null,
    bic: null,
    payment_instructions: null,
    footer_note: null,
  })
  api.getAgencyIssuer.mockResolvedValue(ISSUER)
  api.listClientOptions.mockResolvedValue([CLIENT])
  api.listProjectOptions.mockResolvedValue([{ id: 'pr-1', name: 'Refonte site', price: 1500 }])
  api.createSalesDocumentDraft.mockResolvedValue('new-doc')
  api.updateSalesDocumentDraft.mockResolvedValue(undefined)
  api.saveSalesDocumentLines.mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('Éditeur — nouveau document', () => {
  it('pré-remplit une facture avec les paramètres (échéance, conditions, TVA)', async () => {
    renderAt('/dashboard/documents/nouveau?type=facture')
    expect((await screen.findByTestId('doc-heading')).textContent).toContain('Nouvelle facture')
    expect((screen.getByLabelText('Échéance de paiement') as HTMLInputElement).value).toBe(addDaysIso(todayIso(), 30))
    expect((screen.getByLabelText('Conditions de paiement') as HTMLTextAreaElement).value).toContain('30 jours')
    expect((screen.getByLabelText('TVA') as HTMLSelectElement).value).toBe('20')
    expect(screen.getAllByTestId('line-row')).toHaveLength(1)
  })

  it('pré-remplit un devis (date, validité) et le client depuis l’URL', async () => {
    renderAt('/dashboard/documents/nouveau?type=devis&client=cl-1&projet=pr-1')
    expect((await screen.findByTestId('doc-heading')).textContent).toContain('Nouveau devis')
    expect((screen.getByLabelText('Client') as HTMLSelectElement).value).toBe('cl-1')
    expect((screen.getByLabelText('Date du devis') as HTMLInputElement).value).toBe(todayIso())
    expect((screen.getByLabelText('Valable jusqu’au') as HTMLInputElement).value).toBe(addDaysIso(todayIso(), 15))
    await waitFor(() => expect((screen.getByLabelText('Objet') as HTMLInputElement).value).toBe('Refonte site'))
    expect((screen.getByLabelText('Désignation (ligne 1)') as HTMLTextAreaElement).value).toBe('Refonte site')
  })

  it('recalcule les totaux en direct (multi-taux, remise, saisie à la française)', async () => {
    renderAt('/dashboard/documents/nouveau?type=facture')
    await screen.findByTestId('doc-heading')
    fireEvent.change(screen.getByLabelText('Désignation (ligne 1)'), { target: { value: 'Design' } })
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Prix unitaire HT'), { target: { value: '450' } })
    fireEvent.click(screen.getByText('Ajouter une ligne'))
    const rows = screen.getAllByTestId('line-row')
    expect(rows).toHaveLength(2)
    const r2 = within(rows[1])
    fireEvent.change(r2.getByLabelText('Désignation (ligne 2)'), { target: { value: 'Formation' } })
    fireEvent.change(r2.getByLabelText('Quantité'), { target: { value: '2' } })
    fireEvent.change(r2.getByLabelText('Prix unitaire HT'), { target: { value: '199,99' } })
    fireEvent.change(r2.getByLabelText('TVA'), { target: { value: '10' } })
    fireEvent.change(r2.getByLabelText('Remise %'), { target: { value: '10' } })
    expect(money(screen.getByTestId('total-ht'))).toBe('1 709,98 €')
    expect(money(screen.getByTestId('total-ttc'))).toBe('2 015,98 €')

    fireEvent.click(screen.getByLabelText('TVA non applicable'))
    expect(money(screen.getByTestId('total-ttc'))).toBe('1 709,98 €')
    expect(screen.queryAllByLabelText('TVA')).toHaveLength(0)
  })

  it('enregistre un brouillon (création + lignes) puis redirige', async () => {
    renderAt('/dashboard/documents/nouveau?type=facture')
    await screen.findByTestId('doc-heading')
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cl-1' } })
    fireEvent.change(screen.getByLabelText('Désignation (ligne 1)'), { target: { value: '  Développement  ' } })
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByLabelText('Prix unitaire HT'), { target: { value: '1 000' } })
    fireEvent.click(screen.getByText('Ajouter une ligne')) // ligne vide ignorée
    api.getSalesDocument.mockResolvedValue(detail(makeDoc({ id: 'new-doc' })))
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-save'))
    })
    expect(api.createSalesDocumentDraft).toHaveBeenCalledWith(
      'ag-1',
      'invoice',
      expect.objectContaining({ client_id: 'cl-1', issue_date: null, valid_until: null }),
    )
    const [docId, agencyId, savedLines, previous] = api.saveSalesDocumentLines.mock.calls[0]
    expect(docId).toBe('new-doc')
    expect(agencyId).toBe('ag-1')
    expect(previous).toEqual([])
    expect(savedLines).toHaveLength(1)
    expect(savedLines[0]).toMatchObject({ description: '  Développement  ', quantity: 1.5, unit_price_ht: 1000, vat_rate: 20 })
    await waitFor(() => expect(nav.path).toBe('/dashboard/documents/new-doc'))
  })

  it('refuse un montant invalide', async () => {
    renderAt('/dashboard/documents/nouveau?type=devis')
    await screen.findByTestId('doc-heading')
    fireEvent.change(screen.getByLabelText('Désignation (ligne 1)'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Prix unitaire HT'), { target: { value: '12abc' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-save'))
    })
    expect(screen.getByText(/montants invalides/)).toBeTruthy()
    expect(api.createSalesDocumentDraft).not.toHaveBeenCalled()
  })

  it('bloque la finalisation sans client et liste les problèmes', async () => {
    renderAt('/dashboard/documents/nouveau?type=facture')
    await screen.findByTestId('doc-heading')
    fireEvent.click(screen.getByTestId('action-finalize'))
    expect(await screen.findByText('Sélectionnez un client.')).toBeTruthy()
    expect(screen.getByText('Ajoutez au moins une ligne.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.finalizeSalesDocument).not.toHaveBeenCalled()
  })

  it('finalise après confirmation (enregistre puis numérote)', async () => {
    api.finalizeSalesDocument.mockResolvedValue(makeDoc({ id: 'new-doc', status: 'sent', number: 'FAC-2026-0001' }))
    api.getSalesDocument.mockResolvedValue(detail(makeDoc({ id: 'new-doc', status: 'sent', number: 'FAC-2026-0001' })))
    renderAt('/dashboard/documents/nouveau?type=facture')
    await screen.findByTestId('doc-heading')
    fireEvent.change(screen.getByLabelText('Client'), { target: { value: 'cl-1' } })
    fireEvent.change(screen.getByLabelText('Désignation (ligne 1)'), { target: { value: 'Design' } })
    fireEvent.change(screen.getByLabelText('Prix unitaire HT'), { target: { value: '500' } })
    fireEvent.click(screen.getByTestId('action-finalize'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Émettre cette facture ?')).toBeTruthy()
    expect(money(within(dialog).getByText(/600,00/))).toContain('600,00 € TTC')
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Émettre'))
    })
    expect(api.createSalesDocumentDraft).toHaveBeenCalled()
    expect(api.finalizeSalesDocument).toHaveBeenCalledWith('new-doc')
    await waitFor(() => expect(nav.path).toBe('/dashboard/documents/new-doc'))
  })

  it('avertit sans bloquer un devis si les infos légales manquent', async () => {
    api.getAgencyIssuer.mockResolvedValue({ ...ISSUER, siret: null })
    renderAt('/dashboard/documents/nouveau?type=devis&client=cl-1')
    await screen.findByTestId('doc-heading')
    fireEvent.change(screen.getByLabelText('Désignation (ligne 1)'), { target: { value: 'Audit' } })
    fireEvent.change(screen.getByLabelText('Prix unitaire HT'), { target: { value: '800' } })
    fireEvent.click(screen.getByTestId('action-finalize'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/SIRET est manquant/)).toBeTruthy()
  })
})

describe('Éditeur — document existant', () => {
  it('brouillon : met à jour et supprime les lignes retirées', async () => {
    api.getSalesDocument.mockResolvedValue(detail(makeDoc()))
    renderAt('/dashboard/documents/doc-1')
    expect((await screen.findByTestId('doc-heading')).textContent).toBe('Facture')
    expect(money(screen.getByTestId('total-ttc'))).toBe('1 200,00 €')
    fireEvent.click(screen.getByText('Ajouter une ligne'))
    const rows = screen.getAllByTestId('line-row')
    fireEvent.change(within(rows[1]).getByLabelText('Désignation (ligne 2)'), { target: { value: 'Hébergement' } })
    fireEvent.change(within(rows[1]).getByLabelText('Prix unitaire HT'), { target: { value: '100' } })
    fireEvent.click(screen.getByLabelText('Supprimer la ligne 1'))
    expect(screen.getByText('Modifications non enregistrées')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-save'))
    })
    expect(api.updateSalesDocumentDraft).toHaveBeenCalledWith('doc-1', expect.objectContaining({ title: 'Site vitrine' }))
    const [, , savedLines, previous] = api.saveSalesDocumentLines.mock.calls[0]
    expect(previous).toEqual(['line-1'])
    expect(savedLines.map((l: { description: string }) => l.description)).toEqual(['Hébergement'])
  })

  it('facture émise : lecture seule, paiement et avoir disponibles, pas de suppression', async () => {
    api.getSalesDocument.mockResolvedValue(
      detail(
        makeDoc({
          status: 'sent',
          number: 'FAC-2026-0004',
          issue_date: '2026-11-01',
          due_date: '2099-01-01',
          finalized_at: '2026-11-01T10:00:00Z',
          client_snapshot: { company_name: 'Durand SARL', email: 'marie@ex.fr' },
          issuer_snapshot: { name: 'Studio' },
        }),
      ),
    )
    renderAt('/dashboard/documents/doc-1')
    expect((await screen.findByTestId('doc-heading')).textContent).toContain('Facture FAC-2026-0004')
    expect(screen.getByText('Verrouillé')).toBeTruthy()
    expect(screen.getByText('À encaisser')).toBeTruthy()
    expect(screen.queryByLabelText('Désignation (ligne 1)')).toBeNull()
    expect(screen.getAllByText('Design').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Durand SARL').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ajouter une ligne')).toBeNull()
    expect(screen.getByTestId('action-paid')).toBeTruthy()
    expect(screen.getByTestId('action-credit')).toBeTruthy()
    expect(screen.queryByTestId('action-delete')).toBeNull()
    expect(screen.queryByTestId('action-save')).toBeNull()
    const mail = screen.getByText('E-mail').closest('a') as HTMLAnchorElement
    expect(mail.href).toContain('mailto:marie%40ex.fr')

    api.setSalesDocumentStatus.mockResolvedValue(makeDoc({ status: 'paid' }))
    fireEvent.click(screen.getByTestId('action-paid'))
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Marquer payée'))
    })
    expect(api.setSalesDocumentStatus).toHaveBeenCalledWith('doc-1', 'paid')
  })

  it('facture en retard : statut dérivé affiché', async () => {
    api.getSalesDocument.mockResolvedValue(
      detail(makeDoc({ status: 'sent', number: 'FAC-2026-0002', issue_date: '2026-01-01', due_date: '2026-01-31', finalized_at: '2026-01-01T10:00:00Z' })),
    )
    renderAt('/dashboard/documents/doc-1')
    await screen.findByTestId('doc-heading')
    expect(screen.getByText('En retard')).toBeTruthy()
  })

  it('crée un avoir depuis une facture et y navigue', async () => {
    api.getSalesDocument.mockResolvedValue(
      detail(makeDoc({ status: 'paid', number: 'FAC-2026-0004', issue_date: '2026-11-01', finalized_at: '2026-11-01T10:00:00Z' })),
    )
    api.createCreditNote.mockResolvedValue('cn-1')
    renderAt('/dashboard/documents/doc-1')
    await screen.findByTestId('doc-heading')
    fireEvent.click(screen.getByTestId('action-credit'))
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Créer l’avoir'))
    })
    expect(api.createCreditNote).toHaveBeenCalledWith('doc-1')
    await waitFor(() => expect(nav.path).toBe('/dashboard/documents/cn-1'))
  })

  it('devis envoyé : accepter, refuser, convertir', async () => {
    const quote = makeDoc({ kind: 'quote', status: 'sent', number: 'DEV-2026-0001', issue_date: '2026-11-01', valid_until: '2099-01-01', due_date: null, finalized_at: '2026-11-01T10:00:00Z' })
    api.getSalesDocument.mockResolvedValue(detail(quote))
    api.convertQuoteToInvoice.mockResolvedValue('inv-9')
    renderAt('/dashboard/documents/doc-1')
    expect((await screen.findByTestId('doc-heading')).textContent).toContain('Devis DEV-2026-0001')
    expect(screen.getByTestId('action-accept')).toBeTruthy()
    expect(screen.getByTestId('action-decline')).toBeTruthy()
    expect(screen.getByTestId('action-delete')).toBeTruthy()
    fireEvent.click(screen.getByTestId('action-convert'))
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Créer la facture'))
    })
    expect(api.convertQuoteToInvoice).toHaveBeenCalledWith('doc-1')
    await waitFor(() => expect(nav.path).toBe('/dashboard/documents/inv-9'))
  })

  it('affiche les erreurs serveur', async () => {
    const quote = makeDoc({ kind: 'quote', status: 'sent', number: 'DEV-2026-0001', issue_date: '2026-11-01', valid_until: '2099-01-01', finalized_at: '2026-11-01T10:00:00Z' })
    api.getSalesDocument.mockResolvedValue(detail(quote))
    api.setSalesDocumentStatus.mockRejectedValue(new Error('Changement de statut non autorisé.'))
    renderAt('/dashboard/documents/doc-1')
    await screen.findByTestId('doc-heading')
    await act(async () => {
      fireEvent.click(screen.getByTestId('action-decline'))
    })
    expect(await screen.findByText('Changement de statut non autorisé.')).toBeTruthy()
  })

  it('document introuvable', async () => {
    api.getSalesDocument.mockResolvedValue(null)
    renderAt('/dashboard/documents/unknown')
    expect(await screen.findByText('Document introuvable')).toBeTruthy()
  })
})

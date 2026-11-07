import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SalesDocumentListRow } from '../lib/salesDocumentsApi'

vi.mock('../components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../contexts/AgencyContext', () => ({
  useAgencySession: () => ({ loading: false, agency: { id: 'ag-1', name: 'Studio', logo_url: null } }),
}))
const api = vi.hoisted(() => ({
  listSalesDocuments: vi.fn(),
  getInvoicingSettings: vi.fn(),
  getAgencyIssuer: vi.fn(),
  saveInvoicingSettings: vi.fn(),
}))
vi.mock('../lib/salesDocumentsApi', () => api)

import { SalesDocuments } from './SalesDocuments'

const year = new Date().getFullYear()
const client = { id: 'c1', first_name: 'Marie', last_name: 'Durand', company_name: 'Durand SARL', email: 'marie@ex.fr' }
function row(over: Partial<SalesDocumentListRow>): SalesDocumentListRow {
  return {
    id: Math.random().toString(36).slice(2),
    agency_id: 'ag-1',
    kind: 'invoice',
    status: 'sent',
    client_id: 'c1',
    project_id: null,
    source_document_id: null,
    converted_invoice_id: null,
    number: null,
    title: null,
    issue_date: `${year}-01-10`,
    valid_until: null,
    due_date: '2099-01-01',
    service_date: null,
    notes: null,
    payment_terms: null,
    vat_exempt: false,
    vat_exemption_reason: null,
    subtotal_ht: 100,
    total_vat: 20,
    total_ttc: 120,
    vat_breakdown: [],
    issuer_snapshot: null,
    client_snapshot: null,
    finalized_at: null,
    accepted_at: null,
    declined_at: null,
    paid_at: null,
    cancelled_at: null,
    created_at: `${year}-01-10T10:00:00Z`,
    updated_at: `${year}-01-10T10:00:00Z`,
    client,
    ...over,
  }
}

const DOCS: SalesDocumentListRow[] = [
  row({ kind: 'quote', status: 'sent', number: `DEV-${year}-0001`, title: 'Refonte site', valid_until: '2099-01-01', total_ttc: 1800 }),
  row({ kind: 'quote', status: 'accepted', number: `DEV-${year}-0002`, title: 'Logo', total_ttc: 600 }),
  row({ kind: 'quote', status: 'draft', number: null, title: 'Brouillon devis', client: null, client_id: null }),
  row({ kind: 'invoice', status: 'sent', number: `FAC-${year}-0001`, title: 'Acompte', total_ttc: 1000 }),
  row({ kind: 'invoice', status: 'sent', number: `FAC-${year}-0002`, title: 'Solde', due_date: `${year - 1}-12-01`, total_ttc: 250.5 }),
  row({ kind: 'invoice', status: 'paid', number: `FAC-${year}-0003`, title: 'Maintenance', paid_at: `${year}-02-01T10:00:00Z`, total_ttc: 300 }),
  row({ kind: 'credit_note', status: 'sent', number: `AV-${year}-0001`, title: 'Annulation', total_ttc: 300, client: { ...client, company_name: 'Autre SA' } }),
]

function renderList(path = '/dashboard/documents') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/documents" element={<SalesDocuments />} />
        <Route path="/dashboard/documents/:id" element={<p>Détail</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
const norm = (s: string | null | undefined) => (s ?? '').replace(/[\s\u202f\u00a0]+/g, ' ')

beforeEach(() => {
  vi.clearAllMocks()
  api.listSalesDocuments.mockResolvedValue(DOCS)
})
afterEach(() => cleanup())

describe('Liste devis & factures', () => {
  it('affiche les indicateurs calculés', async () => {
    renderList()
    await screen.findByText(`DEV-${year}-0001`)
    const text = norm(document.body.textContent)
    expect(text).toContain('1 250,50 €') // à encaisser
    expect(text).toContain('250,50 €') // en retard
    expect(text).toContain('300,00 €') // encaissé
    expect(text).toContain('1 800,00 €') // devis en attente
    expect(text).toContain('100 % acceptés')
  })

  it('filtre par onglet, statut et recherche', async () => {
    renderList()
    await screen.findByText(`DEV-${year}-0001`)
    const table = () => document.querySelector('table') as HTMLTableElement
    expect(within(table()).getAllByRole('row')).toHaveLength(1 + 3)

    fireEvent.click(screen.getByRole('tab', { name: /Factures/ }))
    expect(within(table()).getAllByRole('row')).toHaveLength(1 + 3)
    fireEvent.click(screen.getByRole('button', { name: /En retard/ }))
    const rows = within(table()).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1].textContent).toContain(`FAC-${year}-0002`)
    fireEvent.click(screen.getByRole('button', { name: /^Tous/ }))

    fireEvent.change(screen.getByLabelText('Rechercher un document'), { target: { value: 'maintenance' } })
    expect(within(table()).getAllByRole('row')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Rechercher un document'), { target: { value: 'zzz' } })
    expect(screen.getByText('Aucun document ne correspond à vos filtres.')).toBeTruthy()
    fireEvent.click(screen.getByText('Effacer les filtres'))
    expect(within(table()).getAllByRole('row')).toHaveLength(1 + 3)

    fireEvent.click(screen.getByRole('tab', { name: /Avoirs/ }))
    expect(norm(table().textContent)).toContain('Autre SA')
  })

  it('ouvre l’onglet demandé par l’URL et gère les brouillons sans client', async () => {
    renderList('/dashboard/documents?onglet=devis&statut=draft')
    await screen.findAllByText('Brouillon devis')
    expect(norm(document.querySelector('table')?.textContent)).toContain('Client supprimé')
  })

  it('état vide et erreur', async () => {
    api.listSalesDocuments.mockResolvedValueOnce([])
    renderList('/dashboard/documents?onglet=avoirs')
    expect(await screen.findByText('Aucun avoir')).toBeTruthy()
    cleanup()
    api.listSalesDocuments.mockRejectedValueOnce(new Error('Impossible de charger les documents.'))
    renderList()
    expect(await screen.findByText('Impossible de charger les documents.')).toBeTruthy()
  })
})

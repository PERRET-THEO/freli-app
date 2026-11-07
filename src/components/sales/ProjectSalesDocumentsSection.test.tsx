import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SalesDocumentListRow } from '../../lib/salesDocumentsApi'

const api = vi.hoisted(() => ({ listSalesDocuments: vi.fn() }))
vi.mock('../../lib/salesDocumentsApi', () => api)

import { ProjectSalesDocumentsSection } from './ProjectSalesDocumentsSection'

const year = new Date().getFullYear()
const doc = (over: Partial<SalesDocumentListRow>) =>
  ({
    id: 'd1',
    agency_id: 'ag-1',
    kind: 'quote',
    status: 'accepted',
    client_id: 'c1',
    project_id: 'p1',
    number: `DEV-${year}-0001`,
    title: 'Site',
    issue_date: `${year}-01-10`,
    valid_until: '2099-01-01',
    due_date: null,
    total_ttc: 1320,
    paid_at: null,
    created_at: `${year}-01-10T10:00:00Z`,
    ...over,
  }) as SalesDocumentListRow

afterEach(() => {
  cleanup()
  api.listSalesDocuments.mockReset()
})

describe('ProjectSalesDocumentsSection', () => {
  it('filtre par projet et pré-remplit client + projet dans les liens de création', async () => {
    api.listSalesDocuments.mockResolvedValue([])
    render(
      <MemoryRouter>
        <ProjectSalesDocumentsSection agencyId="ag-1" projectId="p1" clientId="c1" />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Un devis accepté fixe le prix du projet/)).toBeTruthy()
    expect(api.listSalesDocuments).toHaveBeenCalledWith('ag-1', { projectId: 'p1' })
    const devis = screen.getByRole('link', { name: '+ Devis' }).getAttribute('href') ?? ''
    expect(devis).toContain('type=devis')
    expect(devis).toContain('projet=p1')
    expect(devis).toContain('client=c1')
  })

  it('liste les documents du projet', async () => {
    api.listSalesDocuments.mockResolvedValue([
      doc({}),
      doc({ id: 'd2', kind: 'invoice', status: 'paid', number: `FAC-${year}-0001`, paid_at: `${year}-02-01T00:00:00Z` }),
    ])
    render(
      <MemoryRouter>
        <ProjectSalesDocumentsSection agencyId="ag-1" projectId="p1" clientId="c1" />
      </MemoryRouter>,
    )
    expect(await screen.findByText(`Devis DEV-${year}-0001`)).toBeTruthy()
    expect(screen.getByText(`Facture FAC-${year}-0001`)).toBeTruthy()
    expect(screen.getByText('Payée')).toBeTruthy()
  })

  it('sans fiche client : pas de bouton de création, explication', async () => {
    api.listSalesDocuments.mockResolvedValue([])
    render(
      <MemoryRouter>
        <ProjectSalesDocumentsSection agencyId="ag-1" projectId="p1" clientId={null} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Rattachez ce projet à une fiche client/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: '+ Devis' })).toBeNull()
  })
})

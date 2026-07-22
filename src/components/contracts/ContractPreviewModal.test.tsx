import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContractPreviewModal } from './ContractPreviewModal'

describe('ContractPreviewModal', () => {
  it('affiche le titre et le HTML dans une iframe', () => {
    render(
      <ContractPreviewModal
        html="<html><body><h1>Contrat test</h1></body></html>"
        title="Aperçu test"
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Aperçu test' })).toBeTruthy()
    expect(screen.getByTitle('Aperçu test')).toBeTruthy()
    expect(screen.getByText('Fermer')).toBeTruthy()
  })
})

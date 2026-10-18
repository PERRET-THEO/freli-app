import { describe, expect, it } from 'vitest'
import { displayDocumentFilename, isExtractableDocumentItem } from './documentDisplay'

describe('displayDocumentFilename', () => {
  it('strips uuid prefix from storage basename', () => {
    expect(
      displayDocumentFilename(
        'proj/item/a1b2c3d4-e5f6-4890-abcd-ef1234567890-cni-recto.pdf',
      ),
    ).toBe('cni-recto.pdf')
  })

  it('keeps plain names', () => {
    expect(displayDocumentFilename('logo.png')).toBe('logo.png')
  })
})

describe('isExtractableDocumentItem', () => {
  it('matches CNI / Kbis / RIB labels', () => {
    expect(isExtractableDocumentItem({ type: 'file', label: 'CNI' })).toBe(true)
    expect(isExtractableDocumentItem({ type: 'file', label: 'Kbis' })).toBe(true)
    expect(isExtractableDocumentItem({ type: 'file', label: 'RIB' })).toBe(true)
  })

  it('skips logos and generic files', () => {
    expect(isExtractableDocumentItem({ type: 'file', label: 'Logo' })).toBe(false)
    expect(isExtractableDocumentItem({ type: 'file', label: 'Charte graphique' })).toBe(false)
    expect(isExtractableDocumentItem({ type: 'text', label: 'CNI' })).toBe(false)
  })

  it('honours config.extractDocument override', () => {
    expect(
      isExtractableDocumentItem({ type: 'file', label: 'Logo', config: { extractDocument: true } }),
    ).toBe(true)
    expect(
      isExtractableDocumentItem({ type: 'file', label: 'CNI', config: { extractDocument: false } }),
    ).toBe(false)
  })
})

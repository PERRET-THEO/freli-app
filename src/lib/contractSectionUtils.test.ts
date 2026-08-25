import { describe, expect, it } from 'vitest'
import {
  isDeHeading,
  isMergeFieldSection,
  isReviewChecklistComplete,
  splitDocumentSections,
} from './contractSectionUtils'
import type { DocumentSection } from './generatedDocuments'

describe('contractSectionUtils', () => {
  it('detecte les sections merge DE/POUR/DATE', () => {
    expect(isDeHeading('DE')).toBe(true)
    expect(isDeHeading('Pour')).toBe(false)
    const section: DocumentSection = {
      id: '1',
      heading: 'DATE',
      content: '23 août 2026',
      origin: 'brief',
      needs_legal_review: false,
    }
    expect(isMergeFieldSection(section)).toBe(true)
  })

  it('separe merge et corps', () => {
    const sections: DocumentSection[] = [
      { id: 'd', heading: 'DE', content: 'Agence', origin: 'brief', needs_legal_review: false },
      { id: 'o', heading: 'Objet', content: 'Prestation', origin: 'ai_generated', needs_legal_review: false },
      { id: 'p', heading: 'POUR', content: 'Client', origin: 'brief', needs_legal_review: false },
    ]
    const { mergeSections, bodySections } = splitDocumentSections(sections)
    expect(mergeSections).toHaveLength(2)
    expect(bodySections).toHaveLength(1)
    expect(bodySections[0].heading).toBe('Objet')
  })

  it('checklist incomplete sans statuts', () => {
    expect(isReviewChecklistComplete({}, [])).toBe(false)
  })

  it('checklist complete quand tous les items sont coches', () => {
    const complete = isReviewChecklistComplete(
      {
        ip: 'validated',
        liability: 'read',
        payment: 'modified',
        termination: 'validated',
      },
      [],
    )
    expect(complete).toBe(true)
  })
})

import type { DocumentSection, DocumentVersion } from './generatedDocuments'

export function normalizeHeading(heading: string): string {
  return heading
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDeHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h === 'DE' || h.startsWith('DE ') || h === 'EXPEDITEUR' || h === 'PRESTATAIRE'
}

export function isPourHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return h === 'POUR' || h.startsWith('POUR ') || h === 'CLIENT' || h === 'DESTINATAIRE'
}

export function isMetaHeading(heading: string): boolean {
  const h = normalizeHeading(heading)
  return (
    h === 'DATE' ||
    h === 'VALIDITE' ||
    h === 'REFERENCE' ||
    h === 'REF' ||
    h === 'REFERENCE DEVIS' ||
    h === 'MONTANT' ||
    h.startsWith('MONTANT ')
  )
}

export function isMergeFieldSection(section: DocumentSection): boolean {
  return isDeHeading(section.heading) || isPourHeading(section.heading) || isMetaHeading(section.heading)
}

export function splitDocumentSections(sections: DocumentSection[]): {
  mergeSections: DocumentSection[]
  bodySections: DocumentSection[]
} {
  const mergeSections: DocumentSection[] = []
  const bodySections: DocumentSection[] = []
  for (const section of sections) {
    if (isMergeFieldSection(section)) mergeSections.push(section)
    else bodySections.push(section)
  }
  return { mergeSections, bodySections }
}

export function sectionContentFromVersion(
  version: DocumentVersion,
  sectionId: string,
): DocumentSection | undefined {
  return version.sections.find((s) => s.id === sectionId)
}

export function isSectionEdited(
  sectionId: string,
  current: DocumentVersion,
  aiVersion: DocumentVersion,
): boolean {
  const cur = sectionContentFromVersion(current, sectionId)
  const ai = sectionContentFromVersion(aiVersion, sectionId)
  if (!cur || !ai) return false
  return cur.heading !== ai.heading || cur.content !== ai.content
}

export type ContractUiPhase = 'draft' | 'reviewable' | 'resolved'

export type ContractFlowStep = 'brief' | 'generation' | 'review' | 'pdf' | 'signature'

export function deriveContractFlowStep(input: {
  isGenerating?: boolean
  status: 'draft' | 'finalized'
  hasPdf: boolean
  needsSignaturePlacement: boolean
}): ContractFlowStep {
  if (input.isGenerating) return 'generation'
  if (input.status === 'draft') return 'review'
  if (input.hasPdf && input.needsSignaturePlacement) return 'signature'
  if (input.status === 'finalized') return input.hasPdf ? 'signature' : 'pdf'
  return 'review'
}

export function deriveUiPhase(
  status: 'draft' | 'finalized',
  showReviewGate: boolean,
): ContractUiPhase {
  if (status === 'finalized') return 'resolved'
  if (showReviewGate) return 'reviewable'
  return 'draft'
}

export type ReviewChecklistItemId =
  | 'ip'
  | 'liability'
  | 'payment'
  | 'termination'
  | 'ai_clauses'

export type ReviewChecklistStatus = 'read' | 'modified' | 'validated'

export const REVIEW_CHECKLIST_ITEMS: Array<{
  id: ReviewChecklistItemId
  label: string
  headingHints: string[]
}> = [
  {
    id: 'ip',
    label: 'Propriété intellectuelle',
    headingHints: ['propriete intellectuelle', 'pi', 'droits d auteur', 'copyright'],
  },
  {
    id: 'liability',
    label: 'Limitation de responsabilité',
    headingHints: ['responsabilite', 'limitation', 'garantie'],
  },
  {
    id: 'payment',
    label: 'Modalités de paiement',
    headingHints: ['paiement', 'tarif', 'financier', 'facturation', 'honoraires'],
  },
  {
    id: 'termination',
    label: 'Résiliation',
    headingHints: ['resiliation', 'termination', 'duree', 'delais'],
  },
  {
    id: 'ai_clauses',
    label: 'Clauses rédigées par l’IA',
    headingHints: [],
  },
]

export function sectionMatchesChecklistItem(
  section: DocumentSection,
  itemId: ReviewChecklistItemId,
): boolean {
  if (itemId === 'ai_clauses') return section.needs_legal_review
  const hints = REVIEW_CHECKLIST_ITEMS.find((i) => i.id === itemId)?.headingHints ?? []
  const h = normalizeHeading(section.heading)
  return hints.some((hint) => h.includes(hint.toUpperCase()))
}

export function isReviewChecklistComplete(
  checklist: Partial<Record<ReviewChecklistItemId, ReviewChecklistStatus>>,
  sections: DocumentSection[],
): boolean {
  const hasAiClauses = sections.some((s) => s.needs_legal_review)
  const requiredIds = REVIEW_CHECKLIST_ITEMS.filter(
    (item) => item.id !== 'ai_clauses' || hasAiClauses,
  ).map((item) => item.id)

  return requiredIds.every((id) => {
    const status = checklist[id]
    return status === 'read' || status === 'modified' || status === 'validated'
  })
}

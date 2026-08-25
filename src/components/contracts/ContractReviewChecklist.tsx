import type { DocumentSection } from '../../lib/generatedDocuments'
import {
  REVIEW_CHECKLIST_ITEMS,
  type ReviewChecklistItemId,
  type ReviewChecklistStatus,
} from '../../lib/contractSectionUtils'

type ContractReviewChecklistProps = {
  sections: DocumentSection[]
  checklist: Partial<Record<ReviewChecklistItemId, ReviewChecklistStatus>>
  onChange: (itemId: ReviewChecklistItemId, status: ReviewChecklistStatus) => void
  onJumpToSection?: (sectionId: string) => void
}

function findSectionForItem(
  sections: DocumentSection[],
  itemId: ReviewChecklistItemId,
): DocumentSection | undefined {
  if (itemId === 'ai_clauses') {
    return sections.find((s) => s.needs_legal_review)
  }
  const hints = REVIEW_CHECKLIST_ITEMS.find((i) => i.id === itemId)?.headingHints ?? []
  return sections.find((s) => {
    const h = s.heading
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    return hints.some((hint) => h.includes(hint))
  })
}

export function ContractReviewChecklist({
  sections,
  checklist,
  onChange,
  onJumpToSection,
}: ContractReviewChecklistProps) {
  const hasAiClauses = sections.some((s) => s.needs_legal_review)
  const items = REVIEW_CHECKLIST_ITEMS.filter((item) => item.id !== 'ai_clauses' || hasAiClauses)

  return (
    <div
      className="rounded-[var(--radius-sm)] border border-[var(--amber)]/30 bg-[var(--amber-soft)]/10 p-4"
      role="region"
      aria-labelledby="review-checklist-title"
    >
      <h3 id="review-checklist-title" className="font-display text-sm font-semibold text-[var(--ink)]">
        Vérifier avant de finaliser
      </h3>
      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
        Indiquez pour chaque point si vous l&apos;avez lu, modifié ou validé.
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const linked = findSectionForItem(sections, item.id)
          const value = checklist[item.id]
          return (
            <li key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-body font-medium text-[var(--ink)]">{item.label}</p>
                {linked && onJumpToSection ? (
                  <button
                    type="button"
                    onClick={() => onJumpToSection(linked.id)}
                    className="text-xs font-body text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Voir la section
                  </button>
                ) : null}
              </div>
              <fieldset className="mt-2">
                <legend className="sr-only">{item.label}</legend>
                <div className="flex flex-wrap gap-3">
                  {(['read', 'modified', 'validated'] as const).map((status) => (
                    <label key={status} className="flex cursor-pointer items-center gap-1.5 text-xs font-body text-[var(--ink)]">
                      <input
                        type="radio"
                        name={`checklist-${item.id}`}
                        checked={value === status}
                        onChange={() => onChange(item.id, status)}
                        className="accent-[var(--accent)]"
                      />
                      {status === 'read' ? 'Lu' : status === 'modified' ? 'Modifié' : 'Validé'}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

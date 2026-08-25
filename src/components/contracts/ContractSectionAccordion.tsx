import type { DocumentSection } from '../../lib/generatedDocuments'

const ORIGIN_LABELS: Record<string, string> = {
  brief: 'Issu du brief',
  model: 'Issu de vos modèles',
  library: 'Bibliothèque',
  ai_generated: 'Rédigé par l’IA',
}

type ContractSectionAccordionProps = {
  section: DocumentSection
  index: number
  total: number
  expanded: boolean
  readOnly: boolean
  isEdited: boolean
  highlighted?: boolean
  onToggle: () => void
  onChange: (patch: Partial<DocumentSection>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onRevertToAi: () => void
  sectionRef?: (el: HTMLDivElement | null) => void
}

function LegalReviewBanner() {
  return (
    <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-3 py-2 text-xs font-body font-medium text-[var(--amber)]">
      Clause rédigée par l&apos;IA — à valider avant envoi.
    </p>
  )
}

export function ContractSectionAccordion({
  section,
  index,
  total,
  expanded,
  readOnly,
  isEdited,
  highlighted,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onRevertToAi,
  sectionRef,
}: ContractSectionAccordionProps) {
  const originLabel = ORIGIN_LABELS[section.origin] ?? section.origin

  return (
    <div
      ref={sectionRef}
      id={`contract-section-${section.id}`}
      className={`scroll-mt-24 rounded-[var(--radius-sm)] border transition-colors ${
        highlighted
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
          : section.needs_legal_review
            ? 'border-[var(--amber)]/40 bg-[var(--amber-soft)]/20'
            : 'border-[var(--border)] bg-[var(--surface)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-start justify-between gap-2 p-3 text-left"
        aria-expanded={expanded}
        aria-controls={`contract-section-panel-${section.id}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-[var(--ink)]">{section.heading}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[var(--white)] px-2 py-0.5 text-[10px] font-body text-[var(--ink-muted)] ring-1 ring-[var(--border)]">
              {originLabel}
            </span>
            {isEdited ? (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-body font-medium text-[var(--accent)]">
                Modifié par vous
              </span>
            ) : null}
            {section.needs_legal_review ? (
              <span className="rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-body font-medium text-[var(--amber)]">
                À valider
              </span>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 text-sm text-[var(--ink-muted)]" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div
          id={`contract-section-panel-${section.id}`}
          className="border-t border-[var(--border)] px-3 pb-3"
        >
          {!readOnly ? (
            <>
              <input
                type="text"
                value={section.heading}
                onChange={(e) => onChange({ heading: e.target.value })}
                aria-label="Titre de la section"
                className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-sm font-body font-semibold text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
              />
              <textarea
                value={section.content}
                onChange={(e) => onChange({ content: e.target.value })}
                rows={Math.min(10, Math.max(3, section.content.split('\n').length + 1))}
                aria-label={`Contenu — ${section.heading}`}
                className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body leading-relaxed text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMove(-1)}
                  disabled={index === 0}
                  className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body text-[var(--ink-muted)] transition hover:bg-[var(--white)] disabled:opacity-30"
                >
                  Monter
                </button>
                <button
                  type="button"
                  onClick={() => onMove(1)}
                  disabled={index === total - 1}
                  className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body text-[var(--ink-muted)] transition hover:bg-[var(--white)] disabled:opacity-30"
                >
                  Descendre
                </button>
                <button
                  type="button"
                  onClick={onRevertToAi}
                  className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body text-[var(--accent)] transition hover:bg-[var(--white)]"
                >
                  Réinitialiser depuis l&apos;IA
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-body text-[#EF4444] transition hover:bg-[#FEF2F2]"
                >
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm font-body leading-relaxed text-[var(--ink-soft)]">
              {section.content}
            </p>
          )}
          {section.needs_legal_review ? <LegalReviewBanner /> : null}
        </div>
      ) : null}
    </div>
  )
}

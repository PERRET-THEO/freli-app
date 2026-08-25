import { useState } from 'react'
import { Button } from '../ui'
import type { DocumentSection } from '../../lib/generatedDocuments'

type ContractReviewRailProps = {
  flaggedSections: DocumentSection[]
  reviewCount: number
  saving: boolean
  previewing: boolean
  finalizing: boolean
  canFinalize: boolean
  showReviewGateHint: boolean
  onSave: () => void
  onPreview: () => void
  onRequestFinalize: () => void
  onDelete?: () => void
  onJumpToSection: (sectionId: string) => void
  className?: string
  variant?: 'sidebar' | 'mobileBar'
}

export function ContractReviewRail({
  flaggedSections,
  reviewCount,
  saving,
  previewing,
  finalizing,
  canFinalize,
  showReviewGateHint,
  onSave,
  onPreview,
  onRequestFinalize,
  onDelete,
  onJumpToSection,
  className = '',
  variant = 'sidebar',
}: ContractReviewRailProps) {
  const [moreOpen, setMoreOpen] = useState(false)

  if (variant === 'mobileBar') {
    const firstFlagged = flaggedSections[0]
    return (
      <aside
        className={`border-t border-[var(--border)] bg-[var(--white)] px-3 pb-2 pt-2 ${className}`}
        aria-label="Actions contrat"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-body text-[var(--ink-muted)]">
            {reviewCount > 0 ? (
              <span className="text-[var(--amber)]">
                {reviewCount} clause{reviewCount > 1 ? 's' : ''} à valider
              </span>
            ) : (
              'Prêt à finaliser'
            )}
          </p>
          {firstFlagged ? (
            <button
              type="button"
              onClick={() => onJumpToSection(firstFlagged.id)}
              className="min-h-11 shrink-0 px-2 text-xs font-body font-medium text-[var(--accent)]"
            >
              Voir
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-stretch gap-2">
          <Button
            variant="secondary"
            className="min-h-11 flex-1"
            onClick={onSave}
            disabled={saving || finalizing || previewing}
          >
            {saving ? '…' : 'Enregistrer'}
          </Button>
          <Button
            className="min-h-11 flex-[1.4]"
            onClick={onRequestFinalize}
            disabled={!canFinalize || saving || finalizing || previewing}
          >
            {finalizing ? 'PDF…' : 'Finaliser'}
          </Button>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="min-h-11 min-w-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-xs font-body text-[var(--ink-muted)]"
            aria-expanded={moreOpen}
            aria-label="Plus d’actions"
          >
            Plus
          </button>
        </div>

        {showReviewGateHint ? (
          <p className="mt-1 text-[10px] font-body text-[var(--ink-muted)]" role="status">
            Complétez la checklist pour finaliser.
          </p>
        ) : null}

        {moreOpen ? (
          <div className="mt-2 flex flex-col gap-1 border-t border-[var(--border)] pt-2">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                onPreview()
              }}
              disabled={saving || finalizing || previewing}
              className="min-h-11 rounded-[var(--radius-sm)] px-3 text-left text-sm font-body text-[var(--ink)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {previewing ? 'Aperçu…' : 'Prévisualiser'}
            </button>
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  onDelete()
                }}
                className="min-h-11 rounded-[var(--radius-sm)] px-3 text-left text-sm font-body text-[#EF4444] transition hover:bg-[#FEF2F2]"
              >
                Supprimer le brouillon
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <aside
      className={`rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-4 ${className}`}
      aria-label="Revue et actions"
    >
      <p className="text-sm font-display font-semibold text-[var(--ink)]">Revue</p>
      {reviewCount > 0 ? (
        <p className="mt-1 text-xs font-body text-[var(--amber)]">
          {reviewCount} clause{reviewCount > 1 ? 's' : ''} à valider
        </p>
      ) : (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">Aucune clause signalée</p>
      )}

      {flaggedSections.length > 0 ? (
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {flaggedSections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onJumpToSection(section.id)}
                className="min-h-11 w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs font-body text-[var(--ink)] transition hover:bg-[var(--surface)]"
              >
                {section.heading}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" onClick={onSave} disabled={saving || finalizing || previewing}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="secondary" onClick={onPreview} disabled={saving || finalizing || previewing}>
          {previewing ? 'Aperçu…' : 'Prévisualiser'}
        </Button>
        <Button onClick={onRequestFinalize} disabled={!canFinalize || saving || finalizing || previewing}>
          {finalizing ? 'Génération du PDF…' : 'Finaliser en PDF pour signature'}
        </Button>
        {showReviewGateHint ? (
          <p className="text-xs font-body text-[var(--ink-muted)]" role="status">
            Complétez la checklist de vérification pour finaliser.
          </p>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="min-h-11 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-body text-[#EF4444] transition hover:bg-[#FEF2F2]"
          >
            Supprimer le brouillon
          </button>
        ) : null}
      </div>
    </aside>
  )
}

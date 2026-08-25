import type { GeneratedDocumentRecord } from '../../lib/generatedDocuments'

type ContractDocumentListProps = {
  documents: GeneratedDocumentRecord[]
  activeId: string | null
  onSelect: (documentId: string) => void
}

function statusLabel(status: GeneratedDocumentRecord['status']): string {
  return status === 'draft' ? 'Brouillon' : 'Finalisé'
}

export function ContractDocumentList({
  documents,
  activeId,
  onSelect,
}: ContractDocumentListProps) {
  if (documents.length <= 1) return null

  return (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Contrats du projet">
      {documents.map((doc) => {
        const active = doc.id === activeId
        const title = doc.current_version.title || 'Contrat sans titre'
        const date = new Date(doc.created_at).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
        })
        return (
          <button
            key={doc.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(doc.id)}
            className={`rounded-[var(--radius-sm)] border px-3 py-2 text-left transition ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--border)] bg-[var(--white)] hover:bg-[var(--surface)]'
            }`}
          >
            <p className="max-w-[12rem] truncate text-sm font-body font-medium text-[var(--ink)]">{title}</p>
            <p className="text-[10px] font-body text-[var(--ink-muted)]">
              {statusLabel(doc.status)} · {date}
            </p>
          </button>
        )
      })}
    </div>
  )
}

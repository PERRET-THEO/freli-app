import { Link } from 'react-router-dom'
import { groupClientDocuments, type ClientDocumentItem } from '../../lib/clientDocuments'

type ClientDocumentsPanelProps = {
  items: ClientDocumentItem[]
  loading?: boolean
}

function DocumentList({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: ClientDocumentItem[]
}) {
  return (
    <div>
      <h3 className="text-xs font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-body font-medium text-[var(--ink)]">
                    {item.title}
                  </p>
                  <p className="text-xs font-body text-[var(--ink-muted)]">
                    {item.statusLabel} ·{' '}
                    <Link
                      to={`/dashboard/project/${item.projectId}`}
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {item.projectName}
                    </Link>
                    {' · '}
                    {new Date(item.occurredAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                {item.href ? (
                  item.href.startsWith('/') ? (
                    <Link
                      to={item.href}
                      className="inline-flex min-h-11 shrink-0 items-center text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Ouvrir
                    </Link>
                  ) : (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 shrink-0 items-center text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Ouvrir
                    </a>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ClientDocumentsPanel({ items, loading = false }: ClientDocumentsPanelProps) {
  const groups = groupClientDocuments(items)

  return (
    <section className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-[var(--ink)]">
        Documents & contrats
      </h2>

      {loading ? (
        <p className="mt-4 text-sm font-body text-[var(--ink-muted)]">Chargement des documents…</p>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface)] px-4 py-6 text-center">
          <p className="text-sm font-body font-medium text-[var(--ink)]">
            Aucun document pour ce client
          </p>
          <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
            Contrats signés, propositions IA et fichiers transmis (logo, DA…) apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          <DocumentList
            title="Contrats signés"
            empty="Aucun contrat signé."
            items={groups.signed}
          />
          <DocumentList
            title="Contrats & propositions IA"
            empty="Aucune proposition IA."
            items={groups.ai}
          />
          <DocumentList
            title="Fichiers transmis"
            empty="Aucun fichier (logo, DA, etc.)."
            items={groups.files}
          />
        </div>
      )}
    </section>
  )
}

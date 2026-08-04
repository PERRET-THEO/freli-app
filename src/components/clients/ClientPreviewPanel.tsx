import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { formatPersonName } from '../../lib/formatPersonName'
import { formatRelative } from '../../lib/formatRelative'
import {
  ATTENTION_STATUS_LABELS,
  attentionBadgeVariant,
  type ClientListRow,
} from '../../lib/clientListQuery'
import { Badge, Button, PersonAvatar } from '../ui'

type ClientPreviewPanelProps = {
  client: ClientListRow | null
  now: number
  onClose: () => void
  onCopyPortal: (row: ClientListRow) => void
}

export function ClientPreviewPanel({
  client,
  now,
  onClose,
  onCopyPortal,
}: ClientPreviewPanelProps) {
  if (!client) return null

  const displayName = formatPersonName(client.first_name, client.last_name)

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--white)] shadow-xl motion-safe:animate-in motion-safe:slide-in-from-right-4 md:max-w-sm"
      role="dialog"
      aria-label={`Aperçu ${displayName}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar
            seed={client.id}
            firstName={client.first_name}
            lastName={client.last_name}
            size="md"
          />
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-semibold text-[var(--ink)]">
              {displayName}
            </h2>
            <p className="truncate text-sm text-[var(--ink-muted)]">{client.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="Fermer l’aperçu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {client.company_name ? (
          <div>
            <p className="text-xs font-display font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Entreprise
            </p>
            <p className="mt-1 text-sm text-[var(--ink)]">{client.company_name}</p>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-display font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Avancement
          </p>
          <div className="mt-1.5">
            <Badge variant={attentionBadgeVariant(client.attention_status)} className="normal-case tracking-normal">
              {ATTENTION_STATUS_LABELS[client.attention_status]}
              {client.project_count > 1 ? ` · ${client.project_count} projets` : ''}
            </Badge>
          </div>
        </div>

        <div>
          <p className="text-xs font-display font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Dernière activité
          </p>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {formatRelative(client.last_activity_at, now) || '—'}
          </p>
        </div>

        <div>
          <p className="text-xs font-display font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Projets
          </p>
          <p className="mt-1 text-sm tabular-nums text-[var(--ink)]">{client.project_count}</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
        <Link to={`/dashboard/client/${client.id}`} className="block">
          <Button type="button" className="w-full">
            Ouvrir la fiche
          </Button>
        </Link>
        <div className="flex gap-2">
          <a
            href={`mailto:${client.email}`}
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            Email
          </a>
          <Link
            to={`/dashboard/new?clientId=${client.id}`}
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            Projet
          </Link>
          {client.portal_token ? (
            <button
              type="button"
              onClick={() => onCopyPortal(client)}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
            >
              Portail
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

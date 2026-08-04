import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatPersonName } from '../../lib/formatPersonName'
import { mailtoHref } from '../../lib/contactLinks'
import type { ClientRecord } from '../../lib/clientRecord'
import { Button, PersonAvatar } from '../ui'

type ClientRecordHeaderProps = {
  client: ClientRecord
  activeProjectCount: number
  portalToken?: string | null
  onCopyPortalLink?: () => void
  onDelete?: () => void
}

export function ClientRecordHeader({
  client,
  activeProjectCount,
  portalToken,
  onCopyPortalLink,
  onDelete,
}: ClientRecordHeaderProps) {
  const displayName = formatPersonName(client.first_name, client.last_name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [menuOpen])

  const relationLabel =
    activeProjectCount === 0
      ? 'Aucun projet actif'
      : activeProjectCount === 1
        ? '1 projet actif'
        : `${activeProjectCount} projets actifs`

  return (
    <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <nav className="mb-3 text-sm font-body text-[var(--ink-muted)]" aria-label="Fil d'Ariane">
          <Link to="/dashboard/clients" className="text-[var(--accent)] underline-offset-2 hover:underline">
            Clients
          </Link>
          <span className="mx-1.5" aria-hidden>
            /
          </span>
          <span className="text-[var(--ink)]">{displayName}</span>
        </nav>

        <div className="flex min-w-0 items-start gap-3">
          <PersonAvatar
            seed={client.id}
            firstName={client.first_name}
            lastName={client.last_name}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-[var(--ink)] sm:text-2xl">
              {displayName}
            </h1>
            <p className="mt-0.5 truncate text-sm font-body text-[var(--ink-muted)]">
              {[client.company_name, client.siret ? `SIRET ${client.siret}` : null]
                .filter(Boolean)
                .join(' · ') || relationLabel}
            </p>
            {(client.company_name || client.siret) && (
              <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">{relationLabel}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.company_type ? (
                <span className="rounded-full bg-[var(--status-action-soft)] px-2 py-0.5 text-[10px] font-body font-semibold text-[var(--status-action)]">
                  {client.company_type}
                </span>
              ) : null}
              {client.industry ? (
                <span className="rounded-full bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] font-body text-[var(--ink-muted)]">
                  {client.industry}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <a href={mailtoHref(client.email)} className="inline-flex">
          <Button className="min-h-11">Envoyer un email</Button>
        </a>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Plus d'actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] text-[var(--ink)] transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-52 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] py-1 shadow-lg">
              {portalToken && onCopyPortalLink ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm font-body text-[var(--ink)] hover:bg-[var(--surface-warm)]"
                  onClick={() => {
                    onCopyPortalLink()
                    setMenuOpen(false)
                  }}
                >
                  Copier le lien portail
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm font-body text-[#EF4444] hover:bg-[#FEF2F2]"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                >
                  Supprimer le client
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

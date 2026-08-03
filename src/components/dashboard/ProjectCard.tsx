import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { mailtoHref, telHref } from '../../lib/contactLinks'
import { getPaymentState } from '../../lib/payments'
import {
  formatBottleneckLabel,
  isBottleneckStale,
} from '../../lib/projectBottleneck'
import { Badge } from '../ui'
import {
  getActivityLabel,
  getSecondaryIndicator,
  getShortStatusLabel,
  getStatusLabel,
} from './projectStatus'
import type { ProjectCardData } from './types'

const AVATAR_PALETTE = [
  'bg-[var(--accent)]',
  'bg-[var(--mint)]',
  'bg-[var(--amber)]',
  'bg-[#F472B6]',
  'bg-[#60A5FA]',
  'bg-[#A78BFA]',
]

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '··'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

type ProjectCardProps = {
  project: ProjectCardData
  now: number
  pendingExtraction: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onCopyLink: (token: string) => void
  onDelete: () => void
}

export function ProjectCard({
  project,
  now,
  pendingExtraction,
  menuOpen,
  onMenuToggle,
  onCopyLink,
  onDelete,
}: ProjectCardProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const displayTitle = project.companyName || project.clientName
  const subtitleName = project.companyName ? project.clientName : null

  const isNew =
    project.status !== 'completed' && now - new Date(project.createdAt).getTime() < 2 * 60 * 60 * 1000

  const totalSteps = Math.max(project.totalCount, 1)
  const segments = Math.min(totalSteps, 8)
  const completedSegments = Math.round((project.completedCount / totalSteps) * segments)

  const statusInput = {
    status: project.status,
    completedCount: project.completedCount,
    lastReminderSentAt: project.lastReminderSentAt,
    now,
  }
  const statusLabel = getStatusLabel(statusInput)
  const shortStatusLabel = getShortStatusLabel(statusInput)

  const secondary = getSecondaryIndicator(project, pendingExtraction, now)
  const activityLabel = getActivityLabel(project, now)
  const paymentState = getPaymentState(project.price, project.paymentStatus)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onMenuToggle()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMenuToggle()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, onMenuToggle])

  const statusBadge =
    project.status === 'in_progress' ? (
      <span
        className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-[var(--status-action-soft)] px-2 py-[3px] font-display text-[10px] font-extrabold uppercase tracking-wide text-[var(--status-action)]"
        title={statusLabel}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--status-action)] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--status-action)]" />
        </span>
        <span className="truncate">
          <span className="sm:hidden">{shortStatusLabel}</span>
          <span className="hidden sm:inline">En cours</span>
        </span>
      </span>
    ) : (
      <Badge variant={project.status} className="max-w-full truncate">
        <span className="truncate" title={statusLabel}>
          <span className="sm:hidden">{shortStatusLabel}</span>
          <span className="hidden sm:inline">{statusLabel}</span>
        </span>
      </Badge>
    )

  return (
    <div className="relative min-w-0">
      {/* Hors de l'article (overflow-hidden) pour ne pas être tronqué par -top-2. */}
      {isNew && (
        <span className="pointer-events-none absolute -top-2 left-4 z-[2] inline-flex items-center gap-1 rounded-full bg-[var(--mint)] px-2 py-[2px] font-display text-[10px] font-extrabold uppercase tracking-wide text-[var(--ink)] shadow-sm">
          Nouveau
        </span>
      )}

      <article
        className={`group relative min-w-0 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-4 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(13,15,20,0.08),0_0_0_1px_rgba(13,15,20,0.06)] sm:p-5 ${
          project.status === 'in_progress' ? 'ring-1 ring-[var(--accent)]/20' : ''
        }`}
      >
        {/* Stretch link: card opens project without nesting interactive children inside <a> */}
        <Link
          to={`/dashboard/project/${project.id}`}
          className="absolute inset-0 z-0 rounded-[var(--radius-lg)]"
          aria-label={`Ouvrir le projet de ${project.clientName}`}
        />

        <div className="relative z-[1] flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${avatarColor(project.id)} font-display text-sm font-extrabold text-[var(--white)]`}
            aria-hidden
          >
            {getInitials(project.clientName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="line-clamp-2 break-words font-display text-[17px] font-bold leading-snug text-[var(--ink)]">
                  {displayTitle}
                </h2>
                {subtitleName ? (
                  <p className="mt-0.5 line-clamp-1 text-[11px] font-body text-[var(--ink-muted)]">
                    {subtitleName}
                  </p>
                ) : null}
                <p className="mt-0.5 min-w-0 truncate text-xs font-body text-[var(--ink-muted)]">
                  <a
                    href={mailtoHref(project.clientEmail)}
                    title={project.clientEmail}
                    className="relative z-[1] break-all text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {project.clientEmail}
                  </a>
                  {project.clientPhone ? (
                    <>
                      {' · '}
                      <a
                        href={telHref(project.clientPhone)}
                        className="relative z-[1] text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {project.clientPhone}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <div className="hidden max-w-[11rem] sm:block">{statusBadge}</div>
                <button
                  type="button"
                  onClick={onMenuToggle}
                  className="relative z-[1] flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--surface-warm)] hover:text-[var(--ink)] sm:h-11 sm:w-11"
                  aria-label="Plus d'options"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  ⋯
                </button>
              </div>
            </div>

            <div className="mt-2 sm:hidden">{statusBadge}</div>
          </div>
        </div>

        {project.blockingStepLabel &&
        project.blockingOwner &&
        project.blockingSince &&
        project.status !== 'completed' ? (
          <p
            className={`relative z-[1] mt-3 text-[11px] font-body ${
              isBottleneckStale({
                label: project.blockingStepLabel,
                owner: project.blockingOwner,
                since: project.blockingSince,
              }, now)
                ? 'font-semibold text-[var(--status-blocked)]'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            {formatBottleneckLabel(
              {
                label: project.blockingStepLabel,
                owner: project.blockingOwner,
                since: project.blockingSince,
              },
              now,
            )}
          </p>
        ) : null}

        <div className="relative z-[1] mt-4">
          <div className="mb-2 flex items-center justify-between text-[11px] font-body text-[var(--ink-muted)]">
            <span className="font-display font-bold text-[var(--ink)]">
              {project.completedCount}/{project.totalCount} étapes
            </span>
            <span>{project.progress}%</span>
          </div>
          {project.totalCount > 0 ? (
            <div
              className="flex gap-1"
              role="progressbar"
              aria-valuenow={project.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {Array.from({ length: segments }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < completedSegments ? 'bg-[var(--accent)]' : 'bg-[var(--surface-warm)]'
                  }`}
                />
              ))}
            </div>
          ) : (
            <div className="h-1.5 rounded-full bg-[var(--surface-warm)]" />
          )}
        </div>

        <div className="relative z-[1] mt-4 flex flex-wrap items-center gap-2">
          {secondary.type === 'relancer' && (
            <span className="inline-flex items-center rounded-full bg-[var(--status-action-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--status-action)]">
              {secondary.label}
            </span>
          )}
          {secondary.type === 'extraction' && (
            <span className="inline-flex items-center rounded-full bg-[var(--status-action-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--status-action)]">
              {secondary.label}
            </span>
          )}
          {paymentState === 'paid' && (
            <span className="inline-flex items-center rounded-full bg-[var(--status-done-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--status-done)]">
              Payé
            </span>
          )}
          {paymentState === 'pending' && project.status === 'completed' && (
            <span className="inline-flex items-center rounded-full bg-[var(--status-waiting-soft)] px-2 py-[3px] font-display text-[10px] font-bold uppercase tracking-wide text-[var(--status-waiting)]">
              Paiement en attente
            </span>
          )}
          <span className="ml-auto truncate text-[11px] font-body text-[var(--ink-muted)]">
            {activityLabel}
          </span>
        </div>

        <div className="relative z-[1] mt-4 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => onCopyLink(project.token)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 text-[12px] font-body font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            aria-label="Copier le lien client"
          >
            Copier le lien
          </button>
        </div>
      </article>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-4 top-14 z-20 w-52 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] py-1 shadow-lg"
        >
          <a
            href={`${typeof window !== 'undefined' ? window.location.origin : ''}/p/${project.token}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm font-body text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            Voir le portail client
          </a>
          <button
            type="button"
            role="menuitem"
            className="w-full px-4 py-2 text-left text-sm font-body text-[var(--ink)] hover:bg-[var(--surface)]"
            onClick={() => onCopyLink(project.token)}
          >
            Copier le lien client
          </button>
          <hr className="my-1 border-[var(--border)]" />
          <button
            type="button"
            role="menuitem"
            className="w-full px-4 py-2 text-left text-sm font-body text-[#EF4444] hover:bg-[#FEF2F2]"
            onClick={onDelete}
          >
            Supprimer le projet
          </button>
        </div>
      )}
    </div>
  )
}

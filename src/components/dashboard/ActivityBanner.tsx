import { Link } from 'react-router-dom'
import { formatRelative } from '../../lib/formatRelative'
import type { ProjectCardData } from './types'

type ActivityBannerProps = {
  draftReminderCount: number
  urgentProjects: ProjectCardData[]
  unreachableProjects: ProjectCardData[]
  agencyPendingProjects: ProjectCardData[]
  recentAutoReminder: ProjectCardData | null
  remindersThisMonth: number
  now: number
}

export function ActivityBanner({
  draftReminderCount,
  urgentProjects,
  unreachableProjects,
  agencyPendingProjects,
  recentAutoReminder,
  remindersThisMonth,
  now,
}: ActivityBannerProps) {
  const showBanner =
    unreachableProjects.length > 0 ||
    draftReminderCount > 0 ||
    agencyPendingProjects.length > 0 ||
    urgentProjects.length > 0 ||
    recentAutoReminder !== null

  if (!showBanner) return null

  if (unreachableProjects.length > 0) {
    const first = unreachableProjects[0]
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--status-blocked-border)] bg-[var(--status-blocked-soft)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm"
            aria-hidden
          >
            📞
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13px] font-bold text-[var(--ink)]">
              Client injoignable — à appeler
            </p>
            <p className="mt-0.5 text-[12px] font-body text-[var(--ink-muted)]">
              <Link
                to={`/dashboard/project/${first.id}`}
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {first.clientName}
              </Link>
              {unreachableProjects.length > 1
                ? ` et ${unreachableProjects.length - 1} autre(s)`
                : ''}{' '}
              — plafond de relances auto atteint. Contactez-les puis réarmez depuis la fiche.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (draftReminderCount > 0) {
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--status-waiting)]/30 bg-[var(--status-waiting-soft)]/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm"
            aria-hidden
          >
            ✨
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13px] font-bold text-[var(--ink)]">
              {draftReminderCount} brouillon{draftReminderCount > 1 ? 's' : ''} de relance IA à
              valider
            </p>
            <p className="mt-0.5 text-[12px] font-body text-[var(--ink-muted)]">
              Ouvrez les fiches projet concernées pour relire, éditer et envoyer.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (agencyPendingProjects.length > 0) {
    const first = agencyPendingProjects[0]
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--status-waiting)]/30 bg-[var(--status-waiting-soft)]/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm"
            aria-hidden
          >
            👀
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13px] font-bold text-[var(--ink)]">
              {agencyPendingProjects.length} projet
              {agencyPendingProjects.length > 1 ? 's' : ''} en attente de votre validation
            </p>
            <p className="mt-0.5 text-[12px] font-body text-[var(--ink-muted)]">
              <Link
                to={`/dashboard/project/${first.id}`}
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {first.clientName}
              </Link>
              {first.blockingStepLabel ? ` — « ${first.blockingStepLabel} »` : ''}
              {agencyPendingProjects.length > 1
                ? ` et ${agencyPendingProjects.length - 1} autre(s)`
                : ''}
              . Le client n’a pas été relancé.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (urgentProjects.length > 0) {
    const first = urgentProjects[0]
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--status-waiting)]/30 bg-[var(--status-waiting-soft)]/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm"
            aria-hidden
          >
            ⚠️
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13px] font-bold text-[var(--ink)]">
              {urgentProjects.length} projet{urgentProjects.length > 1 ? 's' : ''} à relancer
            </p>
            <p className="mt-0.5 text-[12px] font-body text-[var(--ink-muted)]">
              <Link
                to={`/dashboard/project/${first.id}`}
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                {first.clientName}
              </Link>
              {urgentProjects.length > 1 ? ` et ${urgentProjects.length - 1} autre(s)` : ''} attendent
              une action.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (recentAutoReminder?.lastReminderSentAt) {
    return (
      <section className="rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-gradient-to-r from-[var(--accent-soft)] to-transparent px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--white)] text-base shadow-sm"
            aria-hidden
          >
            🤖
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13px] font-bold text-[var(--ink)]">
              Freli travaille pour vous
            </p>
            <p className="mt-0.5 truncate text-[12px] font-body text-[var(--ink-muted)]">
              Dernière auto-relance :{' '}
              <Link
                to={`/dashboard/project/${recentAutoReminder.id}`}
                className="font-semibold text-[var(--ink)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {recentAutoReminder.clientName}
              </Link>
              {' · '}
              {formatRelative(recentAutoReminder.lastReminderSentAt, now)}
            </p>
          </div>
          <span className="rounded-full bg-[var(--white)] px-2.5 py-1 font-display text-[11px] font-bold text-[var(--accent)]">
            {remindersThisMonth} ce mois
          </span>
        </div>
      </section>
    )
  }

  return null
}

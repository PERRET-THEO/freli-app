import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ClientActivityEvent } from '../../lib/clientActivity'

const VISIBLE_EVENTS = 3

type ClientActivityTimelineProps = {
  events: ClientActivityEvent[]
  loading?: boolean
}

export function ClientActivityTimeline({
  events,
  loading = false,
}: ClientActivityTimelineProps) {
  const [expanded, setExpanded] = useState(false)
  const hiddenCount = Math.max(0, events.length - VISIBLE_EVENTS)
  const visibleEvents = expanded ? events : events.slice(0, VISIBLE_EVENTS)

  return (
    <section className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-[var(--ink)]">Activité</h2>

      {loading && events.length === 0 ? (
        <p className="mt-4 text-sm font-body text-[var(--ink-muted)]">Chargement de l’activité…</p>
      ) : events.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface)] px-4 py-6 text-center">
          <p className="text-sm font-body font-medium text-[var(--ink)]">Aucune activité pour l’instant</p>
          <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
            Les relances, documents et signatures des projets de ce client apparaîtront ici.
          </p>
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-0">
            {visibleEvents.map((event) => (
              <li
                key={event.id}
                className="relative border-l border-[var(--border)] py-3 pl-4 first:pt-0 last:pb-0"
              >
                <span
                  className="absolute -left-1 top-4 h-2 w-2 rounded-full bg-[var(--status-action)]"
                  aria-hidden
                />
                <p className="text-sm font-body text-[var(--ink)]">{event.title}</p>
                <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">
                  {new Date(event.occurredAt).toLocaleString('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {event.projectId && event.projectName ? (
                    <>
                      {' · '}
                      <Link
                        to={`/dashboard/project/${event.projectId}`}
                        className="text-[var(--accent)] underline-offset-2 hover:underline"
                      >
                        {event.projectName}
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
          {hiddenCount > 0 ? (
            <div className="mt-2 text-center">
              <button
                type="button"
                className="text-xs font-body text-[var(--accent)]"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? 'Réduire' : `Voir plus (${hiddenCount})`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

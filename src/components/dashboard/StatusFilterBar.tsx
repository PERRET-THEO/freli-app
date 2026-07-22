import { FILTER_LABELS, type ProjectCardData, type StatusFilter } from './types'

type StatusFilterBarProps = {
  filter: StatusFilter
  onFilterChange: (filter: StatusFilter) => void
  projects: ProjectCardData[]
}

export function StatusFilterBar({ filter, onFilterChange, projects }: StatusFilterBarProps) {
  const counts: Record<StatusFilter, number> = {
    all: projects.length,
    in_progress: projects.filter((p) => p.status === 'in_progress').length,
    pending: projects.filter((p) => p.status === 'pending').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Projets</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les projets">
        {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            aria-pressed={filter === key}
            className={`rounded-full px-3 py-1.5 text-sm font-body transition ${
              filter === key
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'border border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)]'
            }`}
          >
            {FILTER_LABELS[key]} ({counts[key]})
          </button>
        ))}
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import type { AttentionView } from '../../lib/projectAttention'
import { getFilterEmptyCopy } from '../../lib/projectAttention'
import { Button, Card } from '../ui'

type FilterEmptyStateProps = {
  view: AttentionView
  hasAnyProjects: boolean
  hasSearch: boolean
  onViewChange: (view: AttentionView) => void
  onClearSearch: () => void
}

export function FilterEmptyState({
  view,
  hasAnyProjects,
  hasSearch,
  onViewChange,
  onClearSearch,
}: FilterEmptyStateProps) {
  const copy = getFilterEmptyCopy(view, { hasAnyProjects, hasSearch })

  return (
    <Card className="mt-6 flex flex-col items-center justify-center py-14 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl"
        aria-hidden
      >
        {view === 'blocked' && hasAnyProjects && !hasSearch ? '✓' : '📂'}
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--ink)]">{copy.title}</h2>
      <p className="mt-2 max-w-md text-sm font-body text-[var(--ink-muted)]">{copy.body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {copy.primaryAction === 'create' ? (
          <Link to="/dashboard/new" className="inline-block">
            <Button>+ Créer mon premier projet</Button>
          </Link>
        ) : null}
        {copy.primaryAction === 'view_waiting' ? (
          <>
            <Button variant="secondary" onClick={() => onViewChange('waiting')}>
              Voir chez le client
            </Button>
            <button
              type="button"
              onClick={() => onViewChange('all')}
              className="text-sm font-body font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Tout voir
            </button>
          </>
        ) : null}
        {copy.primaryAction === 'view_all' ? (
          <Button variant="secondary" onClick={() => onViewChange('all')}>
            Tout voir
          </Button>
        ) : null}
        {copy.primaryAction === 'clear_search' ? (
          <Button variant="secondary" onClick={onClearSearch}>
            Effacer la recherche
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

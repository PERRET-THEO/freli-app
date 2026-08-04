import { Columns3, Download, Search } from 'lucide-react'
import type { VisibilityState } from '@tanstack/react-table'
import {
  CLIENT_ATTENTION_FILTER_LABELS,
  CLIENT_ATTENTION_FILTERS,
  type ClientAttentionFilter,
} from '../../lib/clientsSearchParams'
import { Input } from '../ui'

const OPTIONAL_COLUMNS: { id: string; label: string }[] = [
  { id: 'company', label: 'Entreprise' },
  { id: 'email', label: 'Email' },
  { id: 'created_at', label: 'Créé le' },
]

type ClientsToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  status: ClientAttentionFilter
  onStatusChange: (value: ClientAttentionFilter) => void
  resultCount: number
  density: 'compact' | 'comfortable'
  onDensityChange: (value: 'compact' | 'comfortable') => void
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (next: VisibilityState) => void
  onExportCsv: () => void
}

export function ClientsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  resultCount,
  density,
  onDensityChange,
  columnVisibility,
  onColumnVisibilityChange,
  onExportCsv,
}: ClientsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher par nom, email ou entreprise…"
            className="pl-9"
            aria-label="Rechercher un client"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface)]">
                <Columns3 className="h-4 w-4" aria-hidden />
                Colonnes
              </summary>
              <div className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-2 shadow-md">
                {OPTIONAL_COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface)]"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[col.id] !== false}
                      onChange={(e) =>
                        onColumnVisibilityChange({
                          ...columnVisibility,
                          [col.id]: e.target.checked,
                        })
                      }
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div
            className="flex rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5"
            role="group"
            aria-label="Densité d’affichage"
          >
            <button
              type="button"
              className={`rounded px-2 py-1.5 text-xs font-medium ${
                density === 'compact'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--ink-muted)]'
              }`}
              onClick={() => onDensityChange('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1.5 text-xs font-medium ${
                density === 'comfortable'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--ink-muted)]'
              }`}
              onClick={() => onDensityChange('comfortable')}
            >
              Confort
            </button>
          </div>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface)]"
            title="Exporter la vue en CSV"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Filtres d’avancement">
        {CLIENT_ATTENTION_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatusChange(value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              status === value
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
            aria-pressed={status === value}
          >
            {CLIENT_ATTENTION_FILTER_LABELS[value]}
          </button>
        ))}
        <span className="sr-only" aria-live="polite">
          {resultCount} résultat{resultCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

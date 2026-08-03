import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Badge } from '../ui'
import {
  formatBottleneckLabel,
  isBottleneckStale,
} from '../../lib/projectBottleneck'

export type ClientProjectListItem = {
  id: string
  clientName: string
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: string
  token: string
  progress: number
  completedCount: number
  totalCount: number
  blockingStepLabel: string | null
  blockingOwner: 'client' | 'agency' | null
  blockingSince: string | null
}

type ClientProjectRowProps = {
  project: ClientProjectListItem
  now?: number
}

export function ClientProjectRow({ project, now }: ClientProjectRowProps) {
  const [fallbackNow] = useState(() => Date.now())
  const clock = now ?? fallbackNow
  const bottleneck =
    project.blockingStepLabel && project.blockingOwner && project.blockingSince
      ? {
          label: project.blockingStepLabel,
          owner: project.blockingOwner,
          since: project.blockingSince,
        }
      : null
  const stale = isBottleneckStale(bottleneck, clock)

  return (
    <li>
      <Link
        to={`/dashboard/project/${project.id}`}
        className="block min-w-0 rounded-[var(--radius-sm)] border border-[var(--border)] p-3 transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-body font-semibold text-[var(--ink)]">
              {project.clientName}
            </p>
            <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">
              {new Date(project.createdAt).toLocaleDateString('fr-FR')}
              {project.totalCount > 0
                ? ` · ${project.completedCount}/${project.totalCount} étapes`
                : null}
            </p>
          </div>
          <Badge variant={project.status} />
        </div>

        {project.totalCount > 0 ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-warm)]">
            <div
              className="h-full rounded-full bg-[var(--status-action)] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        ) : null}

        {bottleneck && project.status !== 'completed' ? (
          <p
            className={`mt-2 text-[11px] font-body ${
              stale ? 'font-semibold text-[var(--status-blocked)]' : 'text-[var(--ink-muted)]'
            }`}
          >
            {formatBottleneckLabel(bottleneck, clock)}
          </p>
        ) : null}
      </Link>
    </li>
  )
}

import { formatPersonName } from '../../lib/formatPersonName'
import { formatRelative } from '../../lib/formatRelative'
import {
  ATTENTION_STATUS_LABELS,
  attentionBadgeVariant,
  type ClientListRow,
} from '../../lib/clientListQuery'
import { Badge, PersonAvatar } from '../ui'

type ClientsMobileListProps = {
  rows: ClientListRow[]
  now: number
  onOpen: (row: ClientListRow) => void
}

export function ClientsMobileList({ rows, now, onOpen }: ClientsMobileListProps) {
  return (
    <ul className="space-y-1 md:hidden">
      {rows.map((c) => {
        const displayName = formatPersonName(c.first_name, c.last_name)
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-left transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <PersonAvatar
                seed={c.id}
                firstName={c.first_name}
                lastName={c.last_name}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--ink)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">
                  {formatRelative(c.last_activity_at, now) || c.email}
                </p>
              </div>
              <Badge
                variant={attentionBadgeVariant(c.attention_status)}
                className="shrink-0 normal-case tracking-normal"
              >
                {ATTENTION_STATUS_LABELS[c.attention_status]}
              </Badge>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

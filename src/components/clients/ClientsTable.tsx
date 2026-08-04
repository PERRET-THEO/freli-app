import { useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatPersonName } from '../../lib/formatPersonName'
import { formatRelative } from '../../lib/formatRelative'
import {
  ATTENTION_STATUS_LABELS,
  attentionBadgeVariant,
  type ClientListRow,
} from '../../lib/clientListQuery'
import type { ClientListSort } from '../../lib/clientsSearchParams'
import { Badge, PersonAvatar } from '../ui'

type ClientsTableProps = {
  rows: ClientListRow[]
  sort: ClientListSort
  dir: 'asc' | 'desc'
  onSortChange: (sort: ClientListSort) => void
  density: 'compact' | 'comfortable'
  columnVisibility: VisibilityState
  focusedIndex: number
  onRowActivate: (row: ClientListRow) => void
  onRowOpen: (row: ClientListRow) => void
  onCopyPortal: (row: ClientListRow) => void
  now: number
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" aria-hidden />
  return dir === 'asc' ? (
    <ArrowUp className="ml-1 inline h-3.5 w-3.5" aria-hidden />
  ) : (
    <ArrowDown className="ml-1 inline h-3.5 w-3.5" aria-hidden />
  )
}

export function ClientsTable({
  rows,
  sort,
  dir,
  onSortChange,
  density,
  columnVisibility,
  focusedIndex,
  onRowActivate,
  onRowOpen,
  onCopyPortal,
  now,
}: ClientsTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const rowPad = density === 'compact' ? 'py-1.5' : 'py-2.5'
  const avatarSize = density === 'compact' ? 'sm' : 'md'

  const columns = useMemo<ColumnDef<ClientListRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.first_name} ${row.last_name}`,
        header: 'Client',
        cell: ({ row }) => {
          const c = row.original
          const displayName = formatPersonName(c.first_name, c.last_name)
          const sub = [c.email, c.company_name].filter(Boolean).join(' · ')
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar
                seed={c.id}
                firstName={c.first_name}
                lastName={c.last_name}
                size={avatarSize}
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--ink)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--ink-muted)]">{sub}</p>
              </div>
            </div>
          )
        },
      },
      {
        id: 'attention',
        accessorKey: 'attention_status',
        header: 'Avancement',
        cell: ({ row }) => {
          const c = row.original
          const label = ATTENTION_STATUS_LABELS[c.attention_status] ?? c.attention_status
          const multi =
            c.project_count > 1
              ? ` · ${c.project_count} projets`
              : ''
          return (
            <Badge variant={attentionBadgeVariant(c.attention_status)} className="normal-case tracking-normal">
              {label}
              {multi}
            </Badge>
          )
        },
      },
      {
        id: 'last_activity',
        accessorKey: 'last_activity_at',
        header: 'Dernière activité',
        cell: ({ row }) => (
          <span className="text-[var(--ink-muted)]">
            {formatRelative(row.original.last_activity_at, now) || '—'}
          </span>
        ),
      },
      {
        id: 'project_count',
        accessorKey: 'project_count',
        header: 'Projets',
        cell: ({ row }) => (
          <span className="tabular-nums text-[var(--ink)]">{row.original.project_count}</span>
        ),
      },
      {
        id: 'company',
        accessorKey: 'company_name',
        header: 'Entreprise',
        cell: ({ row }) => (
          <span className="text-[var(--ink-muted)]">{row.original.company_name || '—'}</span>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="truncate text-[var(--ink-muted)]">{row.original.email}</span>
        ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Créé le',
        cell: ({ row }) => (
          <span className="text-[var(--ink-muted)]">
            {new Date(row.original.created_at).toLocaleDateString('fr-FR')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const c = row.original
          const open = openMenuId === c.id
          return (
            <div className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="rounded p-1.5 text-[var(--ink-muted)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--ink)] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="Actions"
                aria-expanded={open}
                onClick={() => setOpenMenuId(open ? null : c.id)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {open ? (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] py-1 shadow-md">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--surface)]"
                    onClick={() => {
                      setOpenMenuId(null)
                      onRowOpen(c)
                    }}
                  >
                    Ouvrir la fiche
                  </button>
                  <a
                    href={`mailto:${c.email}`}
                    className="block px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
                    onClick={() => setOpenMenuId(null)}
                  >
                    Envoyer un email
                  </a>
                  {c.portal_token ? (
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--surface)]"
                      onClick={() => {
                        setOpenMenuId(null)
                        onCopyPortal(c)
                      }}
                    >
                      Copier le lien portail
                    </button>
                  ) : null}
                  <Link
                    to={`/dashboard/new?clientId=${c.id}`}
                    className="block px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
                    onClick={() => setOpenMenuId(null)}
                  >
                    Créer un projet
                  </Link>
                </div>
              ) : null}
            </div>
          )
        },
      },
    ],
    [avatarSize, now, onCopyPortal, onRowOpen, openMenuId],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  const sortKeyForColumn = (columnId: string): ClientListSort | null => {
    if (columnId === 'name') return 'name'
    if (columnId === 'attention') return 'attention'
    if (columnId === 'last_activity') return 'last_activity'
    if (columnId === 'project_count') return 'project_count'
    if (columnId === 'created_at') return 'created_at'
    return null
  }

  useEffect(() => {
    if (!openMenuId) return
    const onDoc = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-clients-row-menu]')) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [openMenuId])

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] md:block">
      <div className="max-h-[calc(100vh-14rem)] overflow-auto">
        <table className="w-full border-collapse text-left text-sm font-body">
          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--border)]">
                {hg.headers.map((header) => {
                  const sortKey = sortKeyForColumn(header.column.id)
                  const active = sortKey === sort
                  const ariaSort = !sortKey
                    ? undefined
                    : active
                      ? dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={`px-3 ${rowPad} font-display text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)] ${
                        header.column.id === 'project_count' ? 'text-center' : ''
                      } ${header.column.id === 'actions' ? 'w-10' : ''}`}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                          onClick={() => onSortChange(sortKey)}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon active={active} dir={dir} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => {
              const focused = index === focusedIndex
              return (
                <tr
                  key={row.id}
                  data-clients-row-menu={openMenuId === row.original.id ? '' : undefined}
                  tabIndex={-1}
                  className={`group cursor-pointer border-b border-[var(--border)] transition last:border-b-0 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
                    focused ? 'bg-[var(--accent-soft)]' : ''
                  }`}
                  onClick={() => onRowActivate(row.original)}
                  onDoubleClick={() => onRowOpen(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-3 ${rowPad} ${
                        cell.column.id === 'project_count' ? 'text-center' : ''
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

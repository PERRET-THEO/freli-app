import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryStates } from 'nuqs'
import type { VisibilityState } from '@tanstack/react-table'
import { DashboardLayout } from '../components/DashboardLayout'
import { ClientsMobileList } from '../components/clients/ClientsMobileList'
import { ClientPreviewPanel } from '../components/clients/ClientPreviewPanel'
import { ClientsTable } from '../components/clients/ClientsTable'
import { ClientsTableSkeleton } from '../components/clients/ClientsTableSkeleton'
import { ClientsToolbar } from '../components/clients/ClientsToolbar'
import { Card } from '../components/ui'
import { useAgencySession } from '../contexts/AgencyContext'
import {
  listClients,
  type ClientListRow,
} from '../lib/clientListQuery'
import {
  CLIENT_LIST_PAGE_SIZE,
  clientsSearchParams,
  type ClientListSort,
} from '../lib/clientsSearchParams'
import { supabase } from '../lib/supabase'

const DENSITY_KEY = 'freli.clients.density'
const COLUMNS_KEY = 'freli.clients.columns'

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  company: false,
  email: false,
  created_at: false,
  name: true,
  attention: true,
  last_activity: true,
  project_count: true,
  actions: true,
}

function loadDensity(): 'compact' | 'comfortable' {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    return v === 'comfortable' ? 'comfortable' : 'compact'
  } catch {
    return 'compact'
  }
}

function loadColumns(): VisibilityState {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    if (!raw) return DEFAULT_COLUMN_VISIBILITY
    return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_COLUMN_VISIBILITY
  }
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return debounced
}

function exportClientsCsv(rows: ClientListRow[]) {
  const header = [
    'Prénom',
    'Nom',
    'Email',
    'Entreprise',
    'Avancement',
    'Projets',
    'Dernière activité',
    'Créé le',
  ]
  const lines = rows.map((r) =>
    [
      r.first_name,
      r.last_name,
      r.email,
      r.company_name ?? '',
      r.attention_status,
      String(r.project_count),
      r.last_activity_at,
      r.created_at,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  )
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clients-freli-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function Clients() {
  const navigate = useNavigate()
  const { agency, loading: sessionLoading } = useAgencySession()
  const [params, setParams] = useQueryStates(clientsSearchParams, {
    history: 'replace',
  })
  const debouncedQ = useDebouncedValue(params.q, 250)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ClientListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [agencyClientTotal, setAgencyClientTotal] = useState(0)
  const [preview, setPreview] = useState<ClientListRow | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [density, setDensity] = useState<'compact' | 'comfortable'>(loadDensity)
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(loadColumns)
  const [now] = useState(() => Date.now())
  const [toast, setToast] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  const pageCount = Math.max(1, Math.ceil(totalCount / CLIENT_LIST_PAGE_SIZE))

  const load = useCallback(async () => {
    if (!agency?.id) {
      setRows([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const result = await listClients({
        agencyId: agency.id,
        search: debouncedQ,
        status: params.status,
        sort: params.sort,
        dir: params.dir,
        page: params.page,
        pageSize: CLIENT_LIST_PAGE_SIZE,
        paginated: true,
      })
      if (requestId !== requestIdRef.current) return
      setRows(result.rows)
      setTotalCount(result.totalCount)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Chargement impossible')
      setRows([])
      setTotalCount(0)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [agency?.id, debouncedQ, params.dir, params.page, params.sort, params.status])

  useEffect(() => {
    if (!agency?.id || sessionLoading) return
    let cancelled = false
    void (async () => {
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agency.id)
      if (!cancelled) setAgencyClientTotal(count ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [agency?.id, sessionLoading])

  useEffect(() => {
    if (sessionLoading) return
    void load()
  }, [load, sessionLoading])

  useEffect(() => {
    setFocusedIndex(-1)
  }, [debouncedQ, params.status, params.page, params.sort, params.dir])

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density)
    } catch {
      /* ignore */
    }
  }, [density])

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(columnVisibility))
    } catch {
      /* ignore */
    }
  }, [columnVisibility])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleSortChange = (sort: ClientListSort) => {
    if (params.sort === sort) {
      void setParams({ dir: params.dir === 'asc' ? 'desc' : 'asc', page: 1 })
    } else {
      void setParams({
        sort,
        dir: sort === 'name' ? 'asc' : 'desc',
        page: 1,
      })
    }
  }

  const openFiche = (row: ClientListRow) => {
    navigate(`/dashboard/client/${row.id}`)
  }

  const activateRow = (row: ClientListRow) => {
    // Desktop: preview panel. Mobile navigates via ClientsMobileList.
    if (window.matchMedia('(min-width: 768px)').matches) {
      setPreview(row)
      setFocusedIndex(rows.findIndex((r) => r.id === row.id))
    } else {
      openFiche(row)
    }
  }

  const copyPortal = async (row: ClientListRow) => {
    if (!row.portal_token) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${row.portal_token}`)
      showToast('Lien portail copié')
    } catch {
      showToast('Impossible de copier le lien')
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'Escape') {
        if (preview) {
          event.preventDefault()
          setPreview(null)
        }
        return
      }

      if (!rows.length) return

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusedIndex((i) => Math.min(rows.length - 1, i < 0 ? 0 : i + 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((i) => Math.max(0, i < 0 ? 0 : i - 1))
      } else if (event.key === 'Enter' && focusedIndex >= 0) {
        event.preventDefault()
        const row = rows[focusedIndex]
        if (row) openFiche(row)
      } else if (event.key === ' ' && focusedIndex >= 0) {
        event.preventDefault()
        const row = rows[focusedIndex]
        if (row) setPreview(row)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedIndex, preview, rows])

  useEffect(() => {
    if (focusedIndex < 0) return
    const row = rows[focusedIndex]
    if (row && preview) setPreview(row)
  }, [focusedIndex, preview, rows])

  const agencyMissing = !sessionLoading && !agency?.id

  const emptyKind = useMemo(() => {
    if (loading || error) return null
    if (agencyMissing) return 'agency'
    if (agencyClientTotal === 0 && !debouncedQ && params.status === 'all' && totalCount === 0) {
      return 'first'
    }
    if (totalCount === 0) return 'filtered'
    return null
  }, [
    agencyClientTotal,
    agencyMissing,
    debouncedQ,
    error,
    loading,
    params.status,
    totalCount,
  ])

  return (
    <DashboardLayout maxWidth="7xl">
      <div ref={listRef} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Clients
            </h1>
            <p className="mt-0.5 text-sm font-body text-[var(--ink-muted)]" aria-live="polite">
              {loading
                ? 'Annuaire'
                : `${totalCount} client${totalCount !== 1 ? 's' : ''}${
                    debouncedQ || params.status !== 'all' ? ' (filtrés)' : ''
                  }`}
            </p>
          </div>
          {!agencyMissing ? (
            <Link
              to="/dashboard/new"
              className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              Nouveau projet
            </Link>
          ) : null}
        </div>

        {agencyMissing ? (
          <Card className="flex flex-col items-center justify-center py-14 text-center">
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">
              Agence non configurée
            </h2>
            <p className="mt-2 max-w-md text-sm font-body text-[var(--ink-muted)]">
              Votre espace agence n&apos;a pas pu être chargé. Configurez-le dans les paramètres pour
              gérer vos clients.
            </p>
            <Link
              to="/dashboard/settings"
              className="mt-6 rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95"
            >
              Ouvrir les paramètres
            </Link>
          </Card>
        ) : (
          <>
            <ClientsToolbar
              search={params.q}
              onSearchChange={(q) => void setParams({ q, page: 1 })}
              status={params.status}
              onStatusChange={(status) => void setParams({ status, page: 1 })}
              resultCount={totalCount}
              density={density}
              onDensityChange={setDensity}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              onExportCsv={() => exportClientsCsv(rows)}
            />

            {error ? (
              <Card className="py-10 text-center">
                <p className="text-sm text-[var(--ink)]">{error}</p>
                <button
                  type="button"
                  className="mt-4 text-sm font-medium text-[var(--accent)] underline"
                  onClick={() => void load()}
                >
                  Réessayer
                </button>
              </Card>
            ) : null}

            {loading && !error ? <ClientsTableSkeleton density={density} /> : null}

            {!loading && !error && emptyKind === 'first' ? (
              <Card className="flex flex-col items-center justify-center py-14 text-center">
                <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">
                  Aucun client
                </h2>
                <p className="mt-2 max-w-md text-sm font-body text-[var(--ink-muted)]">
                  Créez un projet pour ajouter votre premier client.
                </p>
                <Link
                  to="/dashboard/new"
                  className="mt-6 rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95"
                >
                  Nouveau projet
                </Link>
              </Card>
            ) : null}

            {!loading && !error && emptyKind === 'filtered' ? (
              <Card className="flex flex-col items-center justify-center py-14 text-center">
                <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">
                  Aucun résultat
                </h2>
                <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                  Aucun client ne correspond à votre recherche ou à vos filtres.
                </p>
                <button
                  type="button"
                  className="mt-6 text-sm font-medium text-[var(--accent)] underline"
                  onClick={() => void setParams({ q: '', status: 'all', page: 1 })}
                >
                  Effacer les filtres
                </button>
              </Card>
            ) : null}

            {!loading && !error && rows.length > 0 ? (
              <>
                <ClientsTable
                  rows={rows}
                  sort={params.sort}
                  dir={params.dir}
                  onSortChange={handleSortChange}
                  density={density}
                  columnVisibility={columnVisibility}
                  focusedIndex={focusedIndex}
                  onRowActivate={activateRow}
                  onRowOpen={openFiche}
                  onCopyPortal={(row) => void copyPortal(row)}
                  now={now}
                />
                <ClientsMobileList rows={rows} now={now} onOpen={openFiche} />

                {pageCount > 1 ? (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-[var(--ink-muted)]">
                      Page {params.page} / {pageCount}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={params.page <= 1}
                        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
                        onClick={() => void setParams({ page: Math.max(1, params.page - 1) })}
                      >
                        Précédent
                      </button>
                      <button
                        type="button"
                        disabled={params.page >= pageCount}
                        className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-40"
                        onClick={() =>
                          void setParams({ page: Math.min(pageCount, params.page + 1) })
                        }
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>

      {preview ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 bg-[var(--ink)]/20 motion-reduce:transition-none"
            aria-label="Fermer l’aperçu"
            onClick={() => setPreview(null)}
          />
          <ClientPreviewPanel
            client={preview}
            now={now}
            onClose={() => setPreview(null)}
            onCopyPortal={(row) => void copyPortal(row)}
          />
        </>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm text-[var(--white)] shadow-lg md:bottom-8"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}

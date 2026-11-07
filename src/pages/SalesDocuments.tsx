import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Plus, Receipt, Search, Settings2 } from 'lucide-react'
import { DashboardLayout } from '../components/DashboardLayout'
import { InvoicingSettingsDialog } from '../components/sales/InvoicingSettingsDialog'
import { SalesStatusBadge } from '../components/sales/SalesStatusBadge'
import { Card } from '../components/ui'
import { useAgencySession } from '../contexts/AgencyContext'
import {
  clientDisplayName,
  computeKpis,
  displayStatus,
  formatDateFr,
  formatMoney,
  KIND_LABELS,
  salesStatusLabel,
  statusFiltersFor,
  todayIso,
  type SalesDisplayStatus,
  type SalesDocumentKind,
} from '../lib/salesDocuments'
import { listSalesDocuments, type SalesDocumentListRow } from '../lib/salesDocumentsApi'

const TABS: Array<{ kind: SalesDocumentKind; param: string }> = [
  { kind: 'quote', param: 'devis' },
  { kind: 'invoice', param: 'factures' },
  { kind: 'credit_note', param: 'avoirs' },
]

function tabFromParam(value: string | null): SalesDocumentKind {
  return TABS.find((t) => t.param === value)?.kind ?? 'quote'
}

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function KpiCard({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'warning' | 'success' }) {
  const color =
    tone === 'warning'
      ? 'text-[var(--status-action)]'
      : tone === 'success'
        ? 'text-[#0f8a63]'
        : 'text-[var(--ink)]'
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] px-4 py-3">
      <p className="truncate text-xs font-body font-medium text-[var(--ink-muted)]">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </div>
  )
}

export function SalesDocuments() {
  const navigate = useNavigate()
  const { agency, loading: sessionLoading } = useAgencySession()
  const [params, setParams] = useSearchParams()
  const kind = tabFromParam(params.get('onglet'))
  const statusFilter = (params.get('statut') as SalesDisplayStatus | null) ?? null
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [docs, setDocs] = useState<SalesDocumentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [today] = useState(() => todayIso())

  const load = useCallback(async () => {
    if (!agency?.id) return
    setLoading(true)
    setError(null)
    try {
      setDocs(await listSalesDocuments(agency.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [agency?.id])

  useEffect(() => {
    if (sessionLoading) return
    if (!agency?.id) {
      setLoading(false)
      return
    }
    void load()
  }, [load, sessionLoading, agency?.id])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const ofKind = useMemo(() => docs.filter((d) => d.kind === kind), [docs, kind])
  const counts = useMemo(() => {
    const c: Record<SalesDocumentKind, number> = { quote: 0, invoice: 0, credit_note: 0 }
    for (const d of docs) c[d.kind]++
    return c
  }, [docs])
  const kpis = useMemo(() => computeKpis(docs, today), [docs, today])

  const visible = useMemo(() => {
    const needle = normalize(query.trim())
    return ofKind.filter((d) => {
      if (statusFilter && displayStatus(d, today) !== statusFilter) return false
      if (!needle) return true
      const hay = normalize(
        [
          d.number,
          d.title,
          clientDisplayName(d.client ?? d.client_snapshot),
          d.client?.email,
          d.client?.first_name,
          d.client?.last_name,
        ]
          .filter(Boolean)
          .join(' '),
      )
      return hay.includes(needle)
    })
  }, [ofKind, statusFilter, query, today])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  const agencyMissing = !sessionLoading && !agency?.id

  return (
    <DashboardLayout maxWidth="7xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Devis &amp; factures
            </h1>
            <p className="mt-0.5 text-sm font-body text-[var(--ink-muted)]">
              Numérotation automatique, PDF conformes et suivi des paiements.
            </p>
          </div>
          {!agencyMissing ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
              >
                <Settings2 className="h-4 w-4" /> Paramètres
              </button>
              <Link
                to="/dashboard/documents/nouveau?type=devis"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
              >
                <FileText className="h-4 w-4" /> Nouveau devis
              </Link>
              <Link
                to="/dashboard/documents/nouveau?type=facture"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95"
              >
                <Plus className="h-4 w-4" /> Nouvelle facture
              </Link>
            </div>
          ) : null}
        </div>

        {agencyMissing ? (
          <Card className="py-14 text-center">
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">Agence non configurée</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Configurez votre agence dans les paramètres pour émettre des devis et factures.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
              <KpiCard
                label="À encaisser"
                value={loading ? '…' : formatMoney(kpis.toCollect)}
                hint={`${kpis.toCollectCount} facture${kpis.toCollectCount > 1 ? 's' : ''}`}
              />
              <KpiCard
                label="En retard"
                value={loading ? '…' : formatMoney(kpis.overdue)}
                hint={`${kpis.overdueCount} facture${kpis.overdueCount > 1 ? 's' : ''}`}
                tone={kpis.overdueCount > 0 ? 'warning' : 'default'}
              />
              <KpiCard
                label={`Encaissé en ${today.slice(0, 4)}`}
                value={loading ? '…' : formatMoney(kpis.paidThisYear)}
                tone="success"
              />
              <KpiCard
                label="Devis en attente"
                value={loading ? '…' : formatMoney(kpis.pendingQuotes)}
                hint={
                  kpis.acceptanceRate == null
                    ? `${kpis.pendingQuotesCount} devis`
                    : `${kpis.pendingQuotesCount} devis · ${kpis.acceptanceRate} % acceptés`
                }
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div
                role="tablist"
                aria-label="Type de document"
                className="inline-flex w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-1 md:w-auto"
              >
                {TABS.map((t) => (
                  <button
                    key={t.kind}
                    role="tab"
                    type="button"
                    aria-selected={kind === t.kind}
                    onClick={() => {
                      const next = new URLSearchParams(params)
                      next.set('onglet', t.param)
                      next.delete('statut')
                      setParams(next, { replace: true })
                    }}
                    className={`flex-1 rounded-[6px] px-3 py-1.5 text-sm font-body font-medium transition md:flex-none ${
                      kind === t.kind
                        ? 'bg-[var(--ink)] text-[var(--white)]'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    {KIND_LABELS[t.kind].plural}
                    <span className="ml-1.5 tabular-nums opacity-70">{counts[t.kind]}</span>
                  </button>
                ))}
              </div>
              <div className="relative md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setParam('q', e.target.value || null)
                  }}
                  placeholder="Rechercher (n°, client, objet)"
                  aria-label="Rechercher un document"
                  className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] py-2 pl-9 pr-3 text-sm font-body text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5" aria-label="Filtrer par statut">
              <button
                type="button"
                onClick={() => setParam('statut', null)}
                aria-pressed={!statusFilter}
                className={`rounded-full border px-3 py-1 text-xs font-body font-medium transition ${
                  !statusFilter
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
                }`}
              >
                Tous
              </button>
              {statusFiltersFor(kind).map((s) => {
                const n = ofKind.filter((d) => displayStatus(d, today) === s).length
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setParam('statut', statusFilter === s ? null : s)}
                    aria-pressed={statusFilter === s}
                    className={`rounded-full border px-3 py-1 text-xs font-body font-medium transition ${
                      statusFilter === s
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink-soft)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {salesStatusLabel(kind, s)} <span className="tabular-nums opacity-70">{n}</span>
                  </button>
                )
              })}
            </div>

            {error ? (
              <Card className="py-10 text-center">
                <p className="text-sm text-[var(--ink)]">{error}</p>
                <button type="button" className="mt-3 text-sm font-medium text-[var(--accent)] underline" onClick={() => void load()}>
                  Réessayer
                </button>
              </Card>
            ) : loading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
                ))}
              </div>
            ) : ofKind.length === 0 ? (
              <Card className="flex flex-col items-center py-14 text-center">
                <Receipt className="h-8 w-8 text-[var(--ink-muted)]" aria-hidden />
                <h2 className="mt-3 font-display text-xl font-semibold text-[var(--ink)]">
                  {kind === 'quote' ? 'Aucun devis' : kind === 'invoice' ? 'Aucune facture' : 'Aucun avoir'}
                </h2>
                <p className="mt-1 max-w-md text-sm text-[var(--ink-muted)]">
                  {kind === 'credit_note'
                    ? 'Un avoir se crée depuis une facture émise, pour l’annuler ou la corriger.'
                    : 'Créez votre premier document : il sera numéroté automatiquement à la finalisation.'}
                </p>
                {kind !== 'credit_note' ? (
                  <Link
                    to={`/dashboard/documents/nouveau?type=${kind === 'quote' ? 'devis' : 'facture'}`}
                    className="mt-5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--white)]"
                  >
                    {KIND_LABELS[kind].newLabel}
                  </Link>
                ) : null}
              </Card>
            ) : visible.length === 0 ? (
              <Card className="py-10 text-center">
                <p className="text-sm text-[var(--ink)]">Aucun document ne correspond à vos filtres.</p>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-[var(--accent)] underline"
                  onClick={() => {
                    setQuery('')
                    const next = new URLSearchParams(params)
                    next.delete('q')
                    next.delete('statut')
                    setParams(next, { replace: true })
                  }}
                >
                  Effacer les filtres
                </button>
              </Card>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] md:block">
                  <table className="w-full text-left text-sm font-body">
                    <thead className="bg-[var(--surface)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Numéro</th>
                        <th className="px-4 py-2.5 font-semibold">Client</th>
                        <th className="px-4 py-2.5 font-semibold">Objet</th>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">
                          {kind === 'quote' ? 'Validité' : kind === 'invoice' ? 'Échéance' : ''}
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">Montant TTC</th>
                        <th className="px-4 py-2.5 font-semibold">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {visible.map((d) => (
                        <tr
                          key={d.id}
                          className={`cursor-pointer transition hover:bg-[var(--surface)] ${d.status === 'cancelled' ? 'opacity-60' : ''}`}
                          onClick={() => navigate(`/dashboard/documents/${d.id}`)}
                        >
                          <td className="px-4 py-3 font-medium text-[var(--ink)]">
                            <Link
                              to={`/dashboard/documents/${d.id}`}
                              className="hover:underline focus-visible:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {d.number ?? <span className="italic text-[var(--ink-muted)]">Brouillon</span>}
                            </Link>
                          </td>
                          <td className="max-w-[14rem] truncate px-4 py-3 text-[var(--ink)]">
                            {clientDisplayName(d.client ?? d.client_snapshot)}
                          </td>
                          <td className="max-w-[16rem] truncate px-4 py-3 text-[var(--ink-soft)]">{d.title || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--ink-soft)]">
                            {formatDateFr(d.issue_date ?? d.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--ink-soft)]">
                            {kind === 'quote' ? formatDateFr(d.valid_until) : kind === 'invoice' ? formatDateFr(d.due_date) : ''}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[var(--ink)]">
                            {formatMoney(d.total_ttc)}
                          </td>
                          <td className="px-4 py-3">
                            <SalesStatusBadge kind={d.kind} status={displayStatus(d, today)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="space-y-2 md:hidden">
                  {visible.map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/dashboard/documents/${d.id}`}
                        className="block rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--ink)]">
                              {clientDisplayName(d.client ?? d.client_snapshot)}
                            </p>
                            <p className="truncate text-xs text-[var(--ink-muted)]">
                              {d.number ?? 'Brouillon'} · {formatDateFr(d.issue_date ?? d.created_at)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink)]">
                            {formatMoney(d.total_ttc)}
                          </p>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-[var(--ink-soft)]">{d.title || ' '}</p>
                          <SalesStatusBadge kind={d.kind} status={displayStatus(d, today)} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {settingsOpen && agency?.id ? (
        <InvoicingSettingsDialog
          agencyId={agency.id}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false)
            showToast('Paramètres de facturation enregistrés')
          }}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-[calc(5.25rem+var(--safe-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm text-[var(--white)] shadow-lg md:bottom-8"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}

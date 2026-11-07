import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  computeKpis,
  displayStatus,
  formatDateFr,
  formatMoney,
  KIND_LABELS,
  todayIso,
} from '../../lib/salesDocuments'
import { listSalesDocuments, type SalesDocumentListRow } from '../../lib/salesDocumentsApi'
import { SalesStatusBadge } from './SalesStatusBadge'

type Props = {
  agencyId: string | null
  clientId: string
}

export function ClientSalesDocumentsPanel({ agencyId, clientId }: Props) {
  const [docs, setDocs] = useState<SalesDocumentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [today] = useState(() => todayIso())

  useEffect(() => {
    if (!agencyId) return
    let cancelled = false
    listSalesDocuments(agencyId, { clientId })
      .then((rows) => {
        if (cancelled) return
        setDocs(rows)
        setError(false)
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [agencyId, clientId])

  const kpis = useMemo(() => computeKpis(docs, today), [docs, today])
  const invoicedTotal = useMemo(
    () =>
      docs
        .filter((d) => d.kind === 'invoice' && (d.status === 'sent' || d.status === 'paid'))
        .reduce((sum, d) => sum + d.total_ttc, 0),
    [docs],
  )

  return (
    <section className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5" aria-label="Devis et factures du client">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-[var(--ink)]">
          Devis &amp; factures {loading ? '' : `(${docs.length})`}
        </h2>
        <div className="flex gap-2">
          <Link
            to={`/dashboard/documents/nouveau?type=devis&client=${clientId}`}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
          >
            + Devis
          </Link>
          <Link
            to={`/dashboard/documents/nouveau?type=facture&client=${clientId}`}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
          >
            + Facture
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-10 animate-pulse rounded bg-[var(--surface-warm)]" />
          <div className="h-10 animate-pulse rounded bg-[var(--surface-warm)]" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">Impossible de charger les documents.</p>
      ) : docs.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface)] px-4 py-6 text-center">
          <p className="text-sm font-medium text-[var(--ink)]">Aucun devis ni facture</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Envoyez un devis pour démarrer la mission.</p>
        </div>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2.5 py-2">
              <dt className="text-[var(--ink-muted)]">Facturé</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--ink)]">{formatMoney(invoicedTotal)}</dd>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2.5 py-2">
              <dt className="text-[var(--ink-muted)]">À encaisser</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-[var(--ink)]">{formatMoney(kpis.toCollect)}</dd>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2.5 py-2">
              <dt className="text-[var(--ink-muted)]">En retard</dt>
              <dd className={`mt-0.5 font-semibold tabular-nums ${kpis.overdue > 0 ? 'text-[var(--status-action)]' : 'text-[var(--ink)]'}`}>
                {formatMoney(kpis.overdue)}
              </dd>
            </div>
          </dl>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {docs.slice(0, 8).map((d) => (
              <li key={d.id}>
                <Link
                  to={`/dashboard/documents/${d.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      {KIND_LABELS[d.kind].singular} {d.number ?? '(brouillon)'}
                    </p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">
                      {formatDateFr(d.issue_date ?? d.created_at)}
                      {d.title ? ` · ${d.title}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">{formatMoney(d.total_ttc)}</span>
                    <SalesStatusBadge kind={d.kind} status={displayStatus(d, today)} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {docs.length > 8 ? (
            <Link to="/dashboard/documents" className="mt-2 inline-block text-xs font-medium text-[var(--accent)] underline">
              Voir tous les documents
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}

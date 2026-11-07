import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { displayStatus, formatMoney, KIND_LABELS, todayIso } from '../../lib/salesDocuments'
import { listSalesDocuments, type SalesDocumentListRow } from '../../lib/salesDocumentsApi'
import { SalesStatusBadge } from './SalesStatusBadge'

type Props = {
  agencyId: string
  projectId: string
  clientId: string | null
}

/**
 * Devis & factures rattachés au projet (fiche projet, colonne latérale).
 * Un devis accepté fixe le prix du projet ; le paiement en ligne crée la facture.
 */
export function ProjectSalesDocumentsSection({ agencyId, projectId, clientId }: Props) {
  const [docs, setDocs] = useState<SalesDocumentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [today] = useState(() => todayIso())

  useEffect(() => {
    let cancelled = false
    listSalesDocuments(agencyId, { projectId })
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
  }, [agencyId, projectId])

  const params = new URLSearchParams({ projet: projectId })
  if (clientId) params.set('client', clientId)
  const newLink = (type: 'devis' | 'facture') => `/dashboard/documents/nouveau?type=${type}&${params.toString()}`

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4" aria-label="Devis et factures du projet">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Devis &amp; factures</p>
        {clientId ? (
          <div className="flex gap-1.5">
            <Link
              to={newLink('devis')}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
            >
              + Devis
            </Link>
            <Link
              to={newLink('facture')}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)]"
            >
              + Facture
            </Link>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-2 h-9 animate-pulse rounded bg-[var(--surface-warm)]" />
      ) : error ? (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">Impossible de charger les documents.</p>
      ) : docs.length === 0 ? (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
          {clientId
            ? 'Un devis accepté fixe le prix du projet. Le paiement en ligne génère ensuite la facture automatiquement.'
            : 'Rattachez ce projet à une fiche client pour créer un devis ou une facture.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {docs.slice(0, 6).map((d) => (
            <li key={d.id}>
              <Link
                to={`/dashboard/documents/${d.id}`}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-xs font-body hover:bg-[var(--surface)]"
              >
                <span className="min-w-0 truncate text-[var(--ink)]">
                  {KIND_LABELS[d.kind].singular} {d.number ?? '(brouillon)'}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="font-semibold tabular-nums text-[var(--ink)]">{formatMoney(d.total_ttc)}</span>
                  <SalesStatusBadge kind={d.kind} status={displayStatus(d, today)} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

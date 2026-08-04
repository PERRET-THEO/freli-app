import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { formatRelative } from '../../lib/formatRelative'
import {
  DOCUMENT_TYPE_LABELS,
  EXTRACTION_FIELD_LABELS,
  fetchProjectExtractions,
  rejectExtraction,
  validateExtraction,
  type ExtractionRecord,
} from '../../lib/documentExtraction'

type ExtractionReviewPanelProps = {
  projectId: string
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  processing: { label: 'Analyse en cours', className: 'bg-[var(--surface-warm)] text-[var(--ink-soft)]' },
  pending_review: { label: 'À valider', className: 'bg-[var(--accent-soft)] text-[var(--accent)]' },
  validated: { label: 'Validées', className: 'bg-[var(--mint-soft)] text-[var(--mint)]' },
  rejected: { label: 'Rejetées', className: 'bg-[var(--surface-warm)] text-[var(--ink-muted)]' },
  failed: { label: 'Échec', className: 'bg-[#FEF2F2] text-[#EF4444]' },
}

function ExtractionCard({
  extraction,
  onProcessed,
}: {
  extraction: ExtractionRecord
  onProcessed: () => void
}) {
  const aiFields = extraction.extracted_fields ?? {}
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const [key, value] of Object.entries(aiFields)) initial[key] = value ?? ''
    return initial
  })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const badge = STATUS_BADGES[extraction.status] ?? STATUS_BADGES.failed
  const isPending = extraction.status === 'pending_review'
  const displayFields = isPending
    ? aiFields
    : extraction.reviewed_fields ?? aiFields

  const handleValidate = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const reviewed: Record<string, string | null> = {}
      for (const key of Object.keys(aiFields)) {
        reviewed[key] = values[key]?.trim() ? values[key].trim() : null
      }
      const { appliedToClient } = await validateExtraction(extraction.id, reviewed)
      setFeedback(
        appliedToClient
          ? 'Données validées et appliquées à la fiche client.'
          : 'Données validées. Liez un client au projet pour le pré-remplissage automatique.',
      )
      onProcessed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Validation impossible.')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await rejectExtraction(extraction.id)
      setFeedback('Extraction rejetée.')
      onProcessed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Rejet impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-body font-medium text-[var(--ink)]">
          {DOCUMENT_TYPE_LABELS[extraction.document_type]}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-body ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
        {extraction.storage_path.split('/').pop()} · {formatRelative(extraction.created_at)}
      </p>

      {extraction.status === 'failed' && extraction.error_message ? (
        <p className="mt-2 text-xs font-body text-[#EF4444]">{extraction.error_message}</p>
      ) : null}

      {isPending ? (
        <>
          <div className="mt-3 space-y-2">
            {Object.keys(aiFields).map((field) => (
              <div key={field} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center">
                <label className="text-xs font-body font-medium text-[var(--ink-soft)]">
                  {EXTRACTION_FIELD_LABELS[field] ?? field}
                  {typeof extraction.field_confidence?.[field] === 'number' ? (
                    <span className="ml-1 font-normal text-[var(--ink-muted)]">
                      ({Math.round((extraction.field_confidence[field] ?? 0) * 100)} %)
                    </span>
                  ) : null}
                </label>
                <input
                  type="text"
                  value={values[field] ?? ''}
                  placeholder="Non détecté"
                  onChange={(e) => setValues((cur) => ({ ...cur, [field]: e.target.value }))}
                  className={`w-full rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-body outline-none transition focus:border-[var(--accent)] ${
                    aiFields[field] === null
                      ? 'border-dashed border-[var(--border)] bg-[var(--surface-warm)] text-[var(--ink)]'
                      : 'border-[var(--border)] bg-[var(--white)] text-[var(--ink)]'
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={handleValidate} disabled={busy}>
              {busy ? 'Traitement…' : 'Valider les données'}
            </Button>
            <Button variant="secondary" onClick={handleReject} disabled={busy}>
              Rejeter
            </Button>
          </div>
        </>
      ) : extraction.status === 'validated' ? (
        <dl className="mt-3 space-y-1">
          {Object.entries(displayFields).map(([field, value]) => (
            <div key={field} className="flex flex-wrap justify-between gap-2 text-xs font-body">
              <dt className="text-[var(--ink-muted)]">{EXTRACTION_FIELD_LABELS[field] ?? field}</dt>
              <dd className="font-medium text-[var(--ink)]">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {feedback ? <p className="mt-2 text-xs font-body text-[var(--mint)]">{feedback}</p> : null}
      {errorMsg ? <p className="mt-2 text-xs font-body text-[var(--amber)]">{errorMsg}</p> : null}
    </div>
  )
}

export function ExtractionReviewPanel({ projectId }: ExtractionReviewPanelProps) {
  const [extractions, setExtractions] = useState<ExtractionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failedNotice, setFailedNotice] = useState<string | null>(null)

  const load = async () => {
    try {
      const rows = await fetchProjectExtractions(projectId)
      setExtractions(rows)
      const failed = rows.find((row) => row.status === 'failed')
      if (failed?.error_message) {
        setFailedNotice(`Extraction échouée : ${failed.error_message}`)
      } else {
        setFailedNotice(null)
      }
    } catch {
      // table absente ou erreur réseau : la section reste simplement vide
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    const hasProcessing = extractions.some((row) => row.status === 'processing')
    if (!hasProcessing) return
    const timer = window.setInterval(() => {
      void load()
    }, 4000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, extractions])

  if (!loaded || extractions.length === 0) return null

  const pendingCount = extractions.filter((e) => e.status === 'pending_review').length

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Données extraites</h2>
        {pendingCount > 0 ? (
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
            {pendingCount} à valider
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
        Champs détectés par l&apos;IA dans les documents uploadés. Vérifiez et corrigez avant
        validation : rien n&apos;est écrit dans la fiche client sans votre accord. Le pourcentage
        indique la confiance estimée par champ.
      </p>
      {failedNotice ? (
        <p className="mt-2 rounded-[var(--radius-sm)] border border-[#EF4444]/30 bg-[#FEF2F2] px-3 py-2 text-xs font-body text-[#EF4444]">
          {failedNotice}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {extractions.map((extraction) => (
          <ExtractionCard key={extraction.id} extraction={extraction} onProcessed={load} />
        ))}
      </div>
    </Card>
  )
}

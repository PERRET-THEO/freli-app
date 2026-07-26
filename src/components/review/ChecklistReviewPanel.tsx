import { useState } from 'react'
import { Card } from '../ui'
import { supabase } from '../../lib/supabase'
import { formatRelative } from '../../lib/formatRelative'
import { sendProjectReminderEmail } from '../../lib/resend'
import { describeDevice, shortHash, type SignatureProof } from '../../lib/signatureProof'
import { getVisibleItems, hasStoredCondition } from '../../lib/checklistConditions'
import type { ChecklistItemConfig } from '../../lib/checklistFields'
import {
  approveChecklistItem,
  getReviewBadgeLabel,
  getReviewStatus,
  isAwaitingReview,
  isRejected,
  isReviewableType,
  rejectChecklistItem,
  type ReviewStatus,
} from '../../lib/checklistReview'

export type ReviewPanelItem = {
  id: string
  label: string
  type: string
  completed: boolean
  value: string | null
  review_status: ReviewStatus | null
  review_note: string | null
  reviewed_at: string | null
  submitted_at: string | null
  config: ChecklistItemConfig | null
}

type ChecklistReviewPanelProps = {
  projectId: string
  items: ReviewPanelItem[]
  signatureProofs: Record<string, SignatureProof>
  onReviewed: () => void | Promise<void>
}

function SignatureProofBlock({ proof }: { proof: SignatureProof }) {
  const signedAt = new Date(proof.signed_at).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <details className="mt-2 rounded-[var(--radius-xs)] bg-[var(--surface)] px-2 py-1.5">
      <summary className="cursor-pointer list-none text-xs font-body text-[var(--ink-muted)]">
        Preuve de signature
      </summary>
      <dl className="mt-2 space-y-1 text-xs font-body text-[var(--ink-muted)]">
        <div>
          <dt className="inline font-medium">Signataire : </dt>
          <dd className="inline">
            {proof.signer_name ?? '—'}
            {proof.signer_email ? ` (${proof.signer_email})` : ''}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Date : </dt>
          <dd className="inline">{signedAt}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Appareil : </dt>
          <dd className="inline">{describeDevice(proof.user_agent)}</dd>
        </div>
        <div>
          <dt className="inline font-medium">IP : </dt>
          <dd className="inline">{proof.ip_address ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Empreinte SHA-256 : </dt>
          <dd className="inline font-mono" title={proof.document_sha256 ?? undefined}>
            {shortHash(proof.document_sha256)}
          </dd>
        </div>
      </dl>
    </details>
  )
}

const BADGE_CLASSES: Record<ReviewStatus, string> = {
  pending: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  approved: 'bg-[var(--mint-soft)] text-[var(--mint)]',
  rejected: 'bg-[#FEF2F2] text-[#EF4444]',
}

function getFileDownloadUrl(path: string): string {
  const { data } = supabase.storage.from('documents').getPublicUrl(path)
  return data.publicUrl
}

function ItemValue({ item }: { item: ReviewPanelItem }) {
  if (!item.value) {
    return <p className="text-xs font-body text-[var(--ink-muted)]">Aucune valeur transmise.</p>
  }

  if (item.type === 'signature') {
    return (
      <a
        href={item.value}
        target="_blank"
        rel="noreferrer"
        className="text-xs font-body text-[var(--accent)] underline"
      >
        Voir le contrat signé →
      </a>
    )
  }

  if (item.type === 'file') {
    return (
      <a
        href={getFileDownloadUrl(item.value)}
        target="_blank"
        rel="noreferrer"
        className="text-xs font-body text-[var(--accent)] underline"
      >
        Télécharger : {item.value.split('/').pop()}
      </a>
    )
  }

  if (item.type === 'schedule') {
    return (
      <p className="text-xs font-body text-[var(--ink-soft)]">
        {item.value?.trim() || 'Rendez-vous réservé'}
      </p>
    )
  }

  return (
    <p className="whitespace-pre-wrap rounded-[var(--radius-xs)] bg-[var(--surface)] p-2 text-xs font-body text-[var(--ink-soft)]">
      {item.value}
    </p>
  )
}

function ReviewRow({
  projectId,
  item,
  signatureProof,
  hidden,
  onReviewed,
}: {
  projectId: string
  item: ReviewPanelItem
  signatureProof?: SignatureProof
  /** Étape conditionnelle non déclenchée : le client ne la voit pas. */
  hidden: boolean
  onReviewed: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [note, setNote] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const status = getReviewStatus(item)
  const badgeLabel = getReviewBadgeLabel(item)
  const awaiting = isAwaitingReview(item)
  const rejected = isRejected(item)

  const handleApprove = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await approveChecklistItem(item.id)
      await onReviewed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Validation impossible.')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    setBusy(true)
    setErrorMsg(null)
    setFeedback(null)
    try {
      await rejectChecklistItem(item.id, note)
      setShowRejectForm(false)
      setNote('')
      // L'étape se rouvre côté client : sans email il ne saurait pas qu'on l'attend.
      try {
        await sendProjectReminderEmail({ projectId })
        setFeedback('Correction demandée — le client a été prévenu par email.')
      } catch {
        setFeedback('Correction demandée. Email non envoyé — relancez le client manuellement.')
      }
      await onReviewed()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Demande de correction impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className={`rounded-[var(--radius-sm)] border border-[var(--border)] p-3 ${
        hidden ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-body text-sm text-[var(--ink)]">{item.label}</p>
        <div className="flex shrink-0 items-center gap-2">
          {hidden ? (
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-body text-[var(--ink-muted)]">
              Conditionnelle
            </span>
          ) : null}
          {badgeLabel ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-body ${BADGE_CLASSES[status]}`}>
              {badgeLabel}
            </span>
          ) : null}
          <span className={item.completed ? 'text-[var(--mint)]' : 'text-[var(--ink-muted)]'}>
            {item.completed ? '✓' : '○'}
          </span>
        </div>
      </div>

      {hidden ? (
        <p className="mt-1.5 text-xs font-body text-[var(--ink-muted)]">
          Masquée : la réponse attendue à une étape précédente ne correspond pas.
        </p>
      ) : null}

      {rejected && item.review_note ? (
        <div className="mt-2 rounded-[var(--radius-xs)] bg-[#FEF2F2] p-2">
          <p className="text-xs font-body font-medium text-[#EF4444]">Correction demandée</p>
          <p className="mt-0.5 text-xs font-body text-[var(--ink-soft)]">{item.review_note}</p>
        </div>
      ) : null}

      {item.completed ? <div className="mt-2">
        <ItemValue item={item} />
      </div> : null}

      {item.completed && signatureProof ? (
        <SignatureProofBlock proof={signatureProof} />
      ) : null}

      {item.completed && item.submitted_at ? (
        <p className="mt-1.5 text-xs font-body text-[var(--ink-muted)]">
          Transmis {formatRelative(item.submitted_at)}
        </p>
      ) : null}

      {awaiting ? (
        showRejectForm ? (
          <div className="mt-3 space-y-2">
            <textarea
              autoFocus
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ce qui doit être corrigé (visible par le client)"
              className="w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={busy || !note.trim()}
                className="rounded-[var(--radius-xs)] border border-[#EF4444] px-3 py-1.5 text-xs font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                {busy ? 'Envoi…' : 'Confirmer la correction'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRejectForm(false)
                  setNote('')
                }}
                disabled={busy}
                className="rounded-[var(--radius-xs)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-muted)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="rounded-[var(--radius-xs)] bg-[var(--mint)] px-3 py-1.5 text-xs font-body font-medium text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {busy ? 'Validation…' : '✓ Valider'}
            </button>
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              disabled={busy}
              className="rounded-[var(--radius-xs)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink-soft)] transition hover:border-[#EF4444] hover:text-[#EF4444] disabled:opacity-50"
            >
              Demander une correction
            </button>
          </div>
        )
      ) : null}

      {status === 'approved' && item.reviewed_at ? (
        <p className="mt-1.5 text-xs font-body text-[var(--ink-muted)]">
          Validé {formatRelative(item.reviewed_at)}
        </p>
      ) : null}

      {feedback ? (
        <p className="mt-2 text-xs font-body text-[var(--mint)]">{feedback}</p>
      ) : null}
      {errorMsg ? (
        <p className="mt-2 text-xs font-body text-[var(--amber)]">{errorMsg}</p>
      ) : null}
    </li>
  )
}

export function ChecklistReviewPanel({
  projectId,
  items,
  signatureProofs,
  onReviewed,
}: ChecklistReviewPanelProps) {
  const visibleIds = new Set(getVisibleItems(items).map((item) => item.id))
  const awaitingCount = items.filter(
    (item) => visibleIds.has(item.id) && isAwaitingReview(item),
  ).length
  const reviewableCount = items.filter((item) => isReviewableType(item.type)).length
  const conditionalCount = items.filter(hasStoredCondition).length

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Checklist</h2>
        {awaitingCount > 0 ? (
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
            {awaitingCount} à valider
          </span>
        ) : null}
      </div>

      {reviewableCount > 0 ? (
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
          Validez ce que le client transmet, ou demandez une correction avec un motif.
          {conditionalCount > 0
            ? ` ${conditionalCount} étape${conditionalCount > 1 ? 's' : ''} conditionnelle${
                conditionalCount > 1 ? 's' : ''
              }.`
            : ''}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <ReviewRow
            key={item.id}
            projectId={projectId}
            item={item}
            signatureProof={signatureProofs[item.id]}
            hidden={!visibleIds.has(item.id)}
            onReviewed={onReviewed}
          />
        ))}
      </ul>
    </Card>
  )
}

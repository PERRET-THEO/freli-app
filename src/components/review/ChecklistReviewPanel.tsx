import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui'
import { displayDocumentFilename } from '../../lib/documentDisplay'
import { createDocumentSignedUrl } from '../../lib/documentSignedUrl'
import { formatRelative } from '../../lib/formatRelative'
import { sendProjectReminderEmail } from '../../lib/resend'
import { requestSmartReminder } from '../../lib/smartReminders'
import { describeDevice, shortHash, type SignatureProof } from '../../lib/signatureProof'
import { getVisibleItems, hasStoredCondition } from '../../lib/checklistConditions'
import type { ChecklistItemConfig } from '../../lib/checklistFields'
import {
  approveOrClearCredentials,
  convertTextToCredentials,
  CredentialsApiError,
  formatRevealedCredentials,
  isSafeDisplayLoginUrl,
  revealChecklistCredentials,
  type RevealedCredentials,
} from '../../lib/checklistCredentials'
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

const SECRET_REVEAL_TTL_MS = 30_000

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
  /** Si true, la notification de correction passe par le circuit relances IA. */
  aiRemindersEnabled?: boolean
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
  pending: 'bg-[var(--status-info-soft)] text-[var(--status-info)]',
  approved: 'bg-[var(--status-done-soft)] text-[var(--status-done)]',
  rejected: 'bg-[var(--status-action-soft)] text-[var(--status-action)]',
}

function DocumentOpenLink({ path, label }: { path: string; label: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (path.startsWith('http')) {
    return (
      <a href={path} target="_blank" rel="noreferrer" className="text-xs font-body text-[var(--accent)] underline">
        {label}
      </a>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="text-xs font-body text-[var(--accent)] underline disabled:opacity-60"
        onClick={() => {
          setBusy(true)
          setError(null)
          void createDocumentSignedUrl(path).then((url) => {
            setBusy(false)
            if (!url) {
              setError('Lien indisponible')
              return
            }
            window.open(url, '_blank', 'noopener,noreferrer')
          })
        }}
      >
        {busy ? 'Préparation…' : label}
      </button>
      {error ? <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">{error}</p> : null}
    </div>
  )
}

function CredentialsValue({
  item,
  onChanged,
}: {
  item: ReviewPanelItem
  onChanged: () => void | Promise<void>
}) {
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const scheduleAutoHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setRevealed(null), SECRET_REVEAL_TTL_MS)
  }

  const handleReveal = async (action: 'reveal' | 'copy') => {
    setBusy(true)
    setErrorMsg(null)
    try {
      const creds = await revealChecklistCredentials({ itemId: item.id, action })
      if (action === 'copy') {
        await navigator.clipboard.writeText(formatRevealedCredentials(creds))
      }
      setRevealed(creds)
      scheduleAutoHide()
    } catch (reason) {
      if (reason instanceof CredentialsApiError && (reason.status === 410 || reason.code === 'cleared')) {
        setErrorMsg('Secret effacé — plus rien à afficher.')
        setRevealed(null)
      } else {
        setErrorMsg(reason instanceof Error ? reason.message : 'Consultation impossible.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    setBusy(true)
    setErrorMsg(null)
    try {
      await approveOrClearCredentials({ itemId: item.id, action: 'clear' })
      setRevealed(null)
      await onChanged()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Effacement impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (item.value === 'cleared') {
    return (
      <p className="text-xs font-body text-[var(--ink-muted)]">
        Secret effacé — plus consultable.
      </p>
    )
  }

  if (!item.completed || item.value !== 'submitted') {
    return <p className="text-xs font-body text-[var(--ink-muted)]">En attente du client.</p>
  }

  return (
    <div className="space-y-2">
      {revealed ? (
        <div className="rounded-[var(--radius-xs)] bg-[var(--surface)] p-2 text-xs font-body text-[var(--ink-soft)]">
          {'legacy' in revealed ? (
            <p className="whitespace-pre-wrap">{revealed.legacy}</p>
          ) : (
            <dl className="space-y-1">
              <div>
                <dt className="inline font-medium">Identifiant : </dt>
                <dd className="inline">{revealed.username}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Mot de passe : </dt>
                <dd className="inline font-mono">{revealed.password}</dd>
              </div>
              {isSafeDisplayLoginUrl(revealed.loginUrl) ? (
                <div>
                  <dt className="inline font-medium">URL : </dt>
                  <dd className="inline">
                    <a
                      href={revealed.loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] underline"
                    >
                      {revealed.loginUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
          <p className="mt-1 text-[var(--ink-muted)]">Masqué automatiquement dans 30 s.</p>
        </div>
      ) : (
        <p className="text-xs font-body text-[var(--ink-muted)]">•••••••• (secret chiffré)</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => handleReveal('reveal')}
          className="rounded-[var(--radius-xs)] border border-[var(--border)] px-2.5 py-1 text-xs font-body text-[var(--ink-soft)] transition hover:border-[var(--accent)] disabled:opacity-50"
        >
          Afficher
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleReveal('copy')}
          className="rounded-[var(--radius-xs)] border border-[var(--border)] px-2.5 py-1 text-xs font-body text-[var(--ink-soft)] transition hover:border-[var(--accent)] disabled:opacity-50"
        >
          Copier
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleClear}
          className="rounded-[var(--radius-xs)] border border-[var(--border)] px-2.5 py-1 text-xs font-body text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
        >
          Effacer maintenant
        </button>
      </div>
      {errorMsg ? <p className="text-xs font-body text-[var(--amber)]">{errorMsg}</p> : null}
    </div>
  )
}

function ItemValue({
  item,
  onChanged,
}: {
  item: ReviewPanelItem
  onChanged: () => void | Promise<void>
}) {
  if (item.type === 'credentials') {
    return <CredentialsValue item={item} onChanged={onChanged} />
  }

  if (!item.value) {
    return <p className="text-xs font-body text-[var(--ink-muted)]">Aucune valeur transmise.</p>
  }

  if (item.type === 'signature') {
    return <DocumentOpenLink path={item.value} label="Voir le contrat signé →" />
  }

  if (item.type === 'file') {
    return (
      <DocumentOpenLink
        path={item.value}
        label={`Télécharger : ${displayDocumentFilename(item.value)}`}
      />
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
    <div className="space-y-2">
      <p className="whitespace-pre-wrap rounded-[var(--radius-xs)] bg-[var(--surface)] p-2 text-xs font-body text-[var(--ink-soft)]">
        {item.value}
      </p>
      {item.type === 'text' && item.value.trim() ? (
        <ConvertToSecretButton itemId={item.id} onChanged={onChanged} />
      ) : null}
    </div>
  )
}

function ConvertToSecretButton({
  itemId,
  onChanged,
}: {
  itemId: string
  onChanged: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setErrorMsg(null)
          void convertTextToCredentials(itemId)
            .then(() => onChanged())
            .catch((reason) => {
              setErrorMsg(reason instanceof Error ? reason.message : 'Conversion impossible.')
            })
            .finally(() => setBusy(false))
        }}
        className="text-xs font-body text-[var(--accent)] underline disabled:opacity-50"
      >
        {busy ? 'Conversion…' : 'Convertir en secret'}
      </button>
      {errorMsg ? <p className="mt-1 text-xs font-body text-[var(--amber)]">{errorMsg}</p> : null}
    </div>
  )
}

function ReviewRow({
  projectId,
  item,
  signatureProof,
  hidden,
  aiRemindersEnabled,
  onReviewed,
}: {
  projectId: string
  item: ReviewPanelItem
  signatureProof?: SignatureProof
  /** Étape conditionnelle non déclenchée : le client ne la voit pas. */
  hidden: boolean
  aiRemindersEnabled?: boolean
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
      if (item.type === 'credentials') {
        await approveOrClearCredentials({ itemId: item.id, action: 'approve' })
      } else {
        await approveChecklistItem(item.id)
      }
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
        if (aiRemindersEnabled) {
          const result = await requestSmartReminder(projectId, { forceRefresh: true })
          setFeedback(
            result.status === 'sent'
              ? 'Correction demandée — relance IA envoyée au client.'
              : 'Correction demandée — brouillon de relance IA prêt à valider.',
          )
        } else {
          await sendProjectReminderEmail({ projectId })
          setFeedback('Correction demandée — le client a été prévenu par email.')
        }
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

      {item.completed || item.type === 'credentials' ? (
        <div className="mt-2">
          <ItemValue item={item} onChanged={onReviewed} />
        </div>
      ) : null}

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
  aiRemindersEnabled = false,
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
            aiRemindersEnabled={aiRemindersEnabled}
            onReviewed={onReviewed}
          />
        ))}
      </ul>
    </Card>
  )
}

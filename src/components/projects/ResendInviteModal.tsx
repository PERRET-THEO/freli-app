import { useState } from 'react'
import { Button, Input } from '../ui'

type ResendInviteModalProps = {
  email: string
  hasClientRecord: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: (email: string) => void
}

export function ResendInviteModal({
  email,
  hasClientRecord,
  submitting,
  onClose,
  onConfirm,
}: ResendInviteModalProps) {
  const [value, setValue] = useState(email)
  const [editing, setEditing] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resend-invite-title"
        className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5 shadow-lg"
      >
        <h2
          id="resend-invite-title"
          className="font-display text-lg font-bold text-[var(--ink)]"
        >
          Renvoyer l&apos;invitation
        </h2>
        <p className="mt-2 text-sm font-body text-[var(--ink-soft)]">
          Renvoyer l&apos;invitation à{' '}
          <strong className="text-[var(--ink)]">{value.trim() || email}</strong>&nbsp;?
        </p>

        {editing ? (
          <div className="mt-4">
            <label className="text-xs font-body font-medium text-[var(--ink-soft)]">
              Adresse email du client
            </label>
            <Input
              className="mt-1.5"
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            {hasClientRecord ? (
              <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
                L&apos;adresse sera aussi mise à jour sur la fiche client (tous ses projets).
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 text-sm font-body font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            onClick={() => setEditing(true)}
          >
            Modifier l&apos;email du client
          </button>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={() => onConfirm(value.trim())}
            disabled={submitting || !value.trim()}
          >
            {submitting ? 'Envoi…' : 'Renvoyer'}
          </Button>
        </div>
      </div>
    </div>
  )
}

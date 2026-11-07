import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from '../ui'

type ConfirmDialogProps = {
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(13,15,20,0.45)] backdrop-blur-[2px] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-display text-lg font-bold text-[var(--ink)]">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm font-body text-[var(--ink-soft)]">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" className="px-4 py-2" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-[var(--radius-sm)] px-4 py-2 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-[#c2410c] focus-visible:outline-[#c2410c]'
                : 'bg-[var(--accent)] focus-visible:outline-[var(--accent)]'
            }`}
          >
            {busy ? 'Patientez…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

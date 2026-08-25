import type { ReactNode } from 'react'

type SignatureFocusOverlayProps = {
  title?: string
  onClose?: () => void
  children: ReactNode
}

export function SignatureFocusOverlay({
  title = 'Position de la signature',
  onClose,
  children,
}: SignatureFocusOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ink)]/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-focus-title"
    >
      <div className="flex max-h-[min(95dvh,100%)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-[var(--white)] sm:max-h-[90dvh] sm:rounded-[var(--radius-lg)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 pb-3 pt-[max(0.75rem,var(--safe-top))] sm:py-3 sm:pt-3">
          <h2 id="signature-focus-title" className="font-display text-base font-semibold text-[var(--ink)]">
            {title}
          </h2>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-body text-[var(--ink-muted)] transition hover:bg-[var(--surface)]"
              aria-label="Fermer"
            >
              Fermer
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,var(--safe-bottom))] sm:pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}

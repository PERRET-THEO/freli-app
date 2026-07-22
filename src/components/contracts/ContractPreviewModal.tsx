import { useEffect } from 'react'
import { Button } from '../ui'

type ContractPreviewModalProps = {
  html: string
  title?: string
  onClose: () => void
}

export function ContractPreviewModal({ html, title = 'Aperçu du contrat', onClose }: ContractPreviewModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--ink)]/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <p className="font-display text-base font-semibold text-[var(--ink)]">{title}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Fermer
            </Button>
          </div>
        </div>
        <iframe
          title={title}
          srcDoc={html}
          className="min-h-0 flex-1 w-full border-0 bg-white"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  )
}

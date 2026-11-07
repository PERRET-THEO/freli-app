import {
  salesStatusLabel,
  salesStatusTone,
  type SalesDisplayStatus,
  type SalesDocumentKind,
  type SalesStatusTone,
} from '../../lib/salesDocuments'

const TONE_CLASSES: Record<SalesStatusTone, string> = {
  neutral: 'bg-[var(--surface-warm)] text-[var(--ink-soft)]',
  info: 'bg-[var(--status-info-soft)] text-[var(--status-info)]',
  success: 'bg-[var(--status-done-soft)] text-[#0f8a63]',
  warning: 'bg-[var(--status-action-soft)] text-[var(--status-action)]',
  danger: 'bg-[#fdecec] text-[#c2410c]',
  muted: 'bg-[var(--status-waiting-soft)] text-[var(--status-waiting)] line-through decoration-1',
}

export function SalesStatusBadge({
  kind,
  status,
  className = '',
}: {
  kind: SalesDocumentKind
  status: SalesDisplayStatus
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide ${TONE_CLASSES[salesStatusTone(status)]} ${className}`}
      data-status={status}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {salesStatusLabel(kind, status)}
    </span>
  )
}

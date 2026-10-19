import type { ReactNode } from 'react'
import {
  AGENCY_PROJECT_STATUS_LABELS,
  statusColorClasses,
  statusColorToken,
  type AgencyProjectStatus,
} from '../../lib/status'

type BadgeVariant =
  | AgencyProjectStatus
  | 'in_progress'
  | 'completed'
  | 'pending'
  | 'action_required'
  | 'stalled'
  | 'waiting_client'
  | 'draft'

type BadgeProps = {
  children?: ReactNode
  variant: BadgeVariant
  className?: string
}

function resolveStatus(variant: BadgeVariant): AgencyProjectStatus | 'pending' {
  switch (variant) {
    case 'in_progress':
      return 'waiting_client'
    case 'pending':
      return 'waiting_client'
    case 'completed':
      return 'completed'
    case 'action_required':
    case 'stalled':
    case 'waiting_client':
    case 'draft':
      return variant
    default:
      return 'waiting_client'
  }
}

const fallbackLabel: Record<string, string> = {
  ...AGENCY_PROJECT_STATUS_LABELS,
  in_progress: 'En attente client',
  pending: 'En attente',
  completed: 'Terminé',
}

export function Badge({ children, variant, className = '' }: BadgeProps) {
  const status = resolveStatus(variant)
  const color =
    status === 'waiting_client' && variant === 'pending'
      ? statusColorClasses('waiting')
      : statusColorClasses(statusColorToken(status))

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full font-display font-bold text-xs uppercase tracking-wide ${color} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children ?? fallbackLabel[variant] ?? fallbackLabel[status]}
    </span>
  )
}

import type { ReactNode } from 'react'

type BadgeVariant = 'in_progress' | 'completed' | 'pending'

type BadgeProps = {
  children?: ReactNode
  variant: BadgeVariant
  className?: string
}

const badgeStyles: Record<BadgeVariant, string> = {
  in_progress: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  completed: 'bg-[var(--mint-soft)] text-[var(--mint)]',
  pending: 'bg-[var(--amber-soft)] text-[var(--amber)]',
}

const fallbackLabel: Record<BadgeVariant, string> = {
  in_progress: 'En cours',
  completed: 'Complété',
  pending: 'En attente',
}

export function Badge({ children, variant, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full font-display font-bold text-xs uppercase tracking-wide ${badgeStyles[variant]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children ?? fallbackLabel[variant]}
    </span>
  )
}

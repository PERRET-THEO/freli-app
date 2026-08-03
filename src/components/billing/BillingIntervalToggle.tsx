import { motion, useReducedMotion } from 'motion/react'
import type { BillingInterval } from '../../lib/billing/entitlements'

type BillingIntervalToggleProps = {
  value: BillingInterval
  onChange: (interval: BillingInterval) => void
  yearLabel?: string
  layoutId: string
  size?: 'sm' | 'md'
  /** Dark marketing (Pricing) vs light settings (Admin). */
  variant?: 'dark' | 'light'
  className?: string
}

const OPTIONS: { value: BillingInterval; defaultLabel: string }[] = [
  { value: 'month', defaultLabel: 'Mensuel' },
  { value: 'year', defaultLabel: 'Annuel' },
]

export function BillingIntervalToggle({
  value,
  onChange,
  yearLabel = 'Annuel',
  layoutId,
  size = 'md',
  variant = 'dark',
  className = '',
}: BillingIntervalToggleProps) {
  const reduceMotion = useReducedMotion()

  const trackClass =
    variant === 'dark'
      ? 'border-[var(--ink-soft)]'
      : 'border-[var(--border)] bg-[var(--surface-warm)]'

  const inactiveTextClass =
    variant === 'dark'
      ? 'text-[var(--surface-warm)] hover:text-[var(--white)]'
      : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'

  const activeTextClass = 'text-[var(--white)]'

  const padClass = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'

  return (
    <div
      className={`relative inline-flex rounded-full border p-1 ${trackClass} ${className}`}
      role="group"
      aria-label="Période de facturation"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value
        const label = option.value === 'year' ? yearLabel : option.defaultLabel

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`relative rounded-full font-body transition-colors ${padClass} ${
              selected ? activeTextClass : inactiveTextClass
            }`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 z-0 rounded-full bg-[var(--accent)]"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 32 }
                }
              />
            ) : null}
            <span className="relative z-10">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

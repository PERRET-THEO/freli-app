import type { ReactNode } from 'react'
import { Card } from '../ui'

type SettingsSectionProps = {
  id: string
  icon: string
  title: string
  description: string
  children: ReactNode
  badge?: string
  className?: string
}

export function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
  badge,
  className = '',
}: SettingsSectionProps) {
  return (
    <Card id={id} className={`scroll-mt-24 ${className}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">{title}</h2>
            {badge ? (
              <span className="rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--mint)]">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  )
}

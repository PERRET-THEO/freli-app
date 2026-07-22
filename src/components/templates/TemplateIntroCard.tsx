import type { ReactNode } from 'react'
import { Card } from '../ui'

type TemplateIntroCardProps = {
  title: string
  description: string
  countLabel?: string
  children?: ReactNode
}

export function TemplateIntroCard({ title, description, countLabel, children }: TemplateIntroCardProps) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">{title}</h2>
          <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">{description}</p>
        </div>
        {countLabel ? (
          <span className="shrink-0 rounded-full bg-[var(--surface-warm)] px-2.5 py-1 text-xs font-body font-medium text-[var(--ink-muted)]">
            {countLabel}
          </span>
        ) : null}
      </div>
      {children ? <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div> : null}
    </Card>
  )
}

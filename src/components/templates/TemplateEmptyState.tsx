import type { ReactNode } from 'react'
import { Card } from '../ui'

type TemplateEmptyStateProps = {
  icon: string
  title: string
  description: string
  action?: ReactNode
}

export function TemplateEmptyState({ icon, title, description, action }: TemplateEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--ink)]">{title}</h2>
      <p className="mt-2 max-w-md text-sm font-body text-[var(--ink-muted)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  )
}

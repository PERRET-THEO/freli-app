import { Card } from '../ui'

export function ClientDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
        <div className="h-4 w-72 max-w-full rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-56 bg-[var(--white)] p-5">
          <div className="h-4 w-32 rounded bg-[var(--surface-warm)]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-[var(--surface-warm)]" />
            ))}
          </div>
        </Card>
        <Card className="h-56 bg-[var(--white)] p-5">
          <div className="h-4 w-28 rounded bg-[var(--surface-warm)]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-[var(--surface-warm)]" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

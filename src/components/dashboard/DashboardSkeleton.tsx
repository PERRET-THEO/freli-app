import { Card } from '../ui'

export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-9 w-64 rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
        <div className="h-4 w-96 max-w-full rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
      </div>
      <div className="h-14 rounded-[var(--radius-md)] bg-[var(--surface-warm)]" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-[var(--surface-warm)]" />
        ))}
      </div>
      <section className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-44 bg-[var(--white)] p-5">
            <div className="flex gap-3">
              <div className="h-11 w-11 rounded-xl bg-[var(--surface-warm)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[var(--surface-warm)]" />
                <div className="h-3 w-1/2 rounded bg-[var(--surface-warm)]" />
              </div>
            </div>
            <div className="mt-6 h-1.5 rounded-full bg-[var(--surface-warm)]" />
          </Card>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 bg-[var(--white)] p-5">
            <div className="h-3 w-20 rounded bg-[var(--surface-warm)]" />
            <div className="mt-4 h-8 w-12 rounded bg-[var(--surface-warm)]" />
          </Card>
        ))}
      </section>
    </div>
  )
}

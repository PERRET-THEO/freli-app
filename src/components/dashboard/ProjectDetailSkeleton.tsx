import { Card } from '../ui'

export function ProjectDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-72 max-w-full rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
        <div className="h-4 w-48 rounded-[var(--radius-sm)] bg-[var(--surface-warm)]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-40 bg-[var(--white)] p-5">
              <div className="h-5 w-40 rounded bg-[var(--surface-warm)]" />
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-[var(--surface-warm)]" />
                <div className="h-3 w-5/6 rounded bg-[var(--surface-warm)]" />
                <div className="h-3 w-2/3 rounded bg-[var(--surface-warm)]" />
              </div>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card className="h-36 bg-[var(--white)] p-5">
            <div className="h-4 w-28 rounded bg-[var(--surface-warm)]" />
            <div className="mt-4 h-16 rounded bg-[var(--surface-warm)]" />
          </Card>
          <Card className="h-48 bg-[var(--white)] p-5">
            <div className="h-4 w-32 rounded bg-[var(--surface-warm)]" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-[var(--surface-warm)]" />
              <div className="h-3 w-4/5 rounded bg-[var(--surface-warm)]" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

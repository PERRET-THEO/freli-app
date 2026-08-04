type ClientsTableSkeletonProps = {
  rows?: number
  density?: 'compact' | 'comfortable'
}

export function ClientsTableSkeleton({
  rows = 12,
  density = 'compact',
}: ClientsTableSkeletonProps) {
  const h = density === 'compact' ? 'h-9' : 'h-11'

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)]"
      aria-hidden
    >
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <div className="flex gap-6">
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-3 w-24 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-3 w-28 animate-pulse rounded bg-[var(--border)]" />
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--border)]" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 border-b border-[var(--border)] px-3 last:border-b-0 ${h}`}
        >
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-[var(--border)]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-40 max-w-[50%] animate-pulse rounded bg-[var(--border)]" />
            <div className="h-2.5 w-56 max-w-[70%] animate-pulse rounded bg-[var(--border)]" />
          </div>
          <div className="hidden h-5 w-20 animate-pulse rounded-full bg-[var(--border)] sm:block" />
          <div className="hidden h-3 w-16 animate-pulse rounded bg-[var(--border)] md:block" />
        </div>
      ))}
    </div>
  )
}

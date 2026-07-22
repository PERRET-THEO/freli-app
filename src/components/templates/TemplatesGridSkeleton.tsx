function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-warm)] ${className}`} />
}

function CardSkeleton() {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--white)] p-5 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)]">
      <div className="flex items-start gap-3">
        <Block className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Block className="h-5 w-40" />
          <Block className="h-3 w-28" />
          <div className="flex gap-2 pt-1">
            <Block className="h-5 w-20 rounded-full" />
            <Block className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3">
        <Block className="h-8 flex-1" />
        <Block className="h-8 flex-1" />
      </div>
    </div>
  )
}

export function TemplatesGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

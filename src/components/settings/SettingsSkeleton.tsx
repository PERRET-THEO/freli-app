import { Card } from '../ui'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-warm)] ${className}`} />
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <Block className="h-16 w-16 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Block className="h-6 w-48" />
            <Block className="h-4 w-64" />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <div className="hidden space-y-2 lg:block">
          <Block className="h-9 w-full" />
          <Block className="h-9 w-full" />
          <Block className="h-9 w-full" />
          <Block className="h-9 w-full" />
        </div>
        <div className="space-y-4">
          <Card>
            <Block className="h-6 w-40" />
            <Block className="mt-4 h-10 w-full" />
            <Block className="mt-3 h-24 w-full" />
          </Card>
          <Card>
            <Block className="h-6 w-44" />
            <Block className="mt-4 h-10 w-full" />
            <Block className="mt-3 h-10 w-full" />
          </Card>
        </div>
      </div>
    </div>
  )
}
